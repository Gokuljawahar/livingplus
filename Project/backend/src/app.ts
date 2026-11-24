import express from 'express';
import multer from 'multer';
import { access } from 'fs/promises';
import jwt from 'jsonwebtoken';
import routes from './routes/index.js';
import { authenticate, optionalAuthenticate } from './middleware/auth.middleware.js';
import { getJwtSecret } from './utils/auth-config.js';
import { resolvePgHost } from './middleware/pg-host.middleware.js';
import { cronRoutes } from './routes/cron.routes.js';
import { directUploadUrl, localUploadPath, newFileKey, putFile, storageKind, viewUrl } from './services/storage.js';
import { applyHttpHardening } from './middleware/http-hardening.js';
import { logger } from './utils/logger.js';
import { handleInboundText, textMessages, validSignature, verifySubscription, whatsappInboundEnabled } from './services/whatsapp-inbound.js';
import { createChatModel } from './services/ai-provider.js';
import { runChat } from './services/ai-orchestrator.js';

const app = express();
// Every query runs for the request's caller under PostgreSQL Row-Level Security (db/client.ts).
// Search vectors are large and internal: never returned unless selected explicitly (set on the client).
export { prisma, systemPrisma } from './db/client.js';
import { prisma, systemPrisma } from './db/client.js';
import { asSystem, dbContextMiddleware, rebindDbContext } from './db/context.js';

applyHttpHardening(app);
// WhatsApp webhook: before the JSON parser, because Meta's signature covers the raw body.
// Returns 404 unless WhatsApp Cloud API inbound is fully configured.
app.get('/webhooks/whatsapp', (req, res) => {
  if (!whatsappInboundEnabled()) return res.sendStatus(404);
  const challenge = verifySubscription(req.query as Record<string, unknown>);
  return challenge === null ? res.sendStatus(403) : res.type('text/plain').send(challenge);
});
app.post('/webhooks/whatsapp', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  if (!whatsappInboundEnabled()) return res.sendStatus(404);
  if (!Buffer.isBuffer(req.body) || !validSignature(req.body, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  try {
    const messages = textMessages(JSON.parse(req.body.toString('utf8')));
    if (messages.length) {
      const model = await createChatModel('chat');
      for (const message of messages) await handleInboundText(message, { chat: (chatReq, input) => runChat(chatReq, model, input) });
    }
  } catch (error) {
    logger.error({ err: error }, 'WhatsApp webhook error');
  }
  // Always acknowledge, so Meta does not retry a message we already handled.
  return res.sendStatus(200);
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));
// After the body parsers: their stream callbacks would otherwise drop the context.
app.use(dbContextMiddleware);
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Liveness probe and scheduled jobs: outside /api PG host routing.
// Liveness: Cloud Run reserves paths ending in "z" (/healthz never reaches the
// app there), so /health is the public one; /healthz stays for local tooling.
app.get(['/health', '/healthz'], (_req, res) => { res.json({ ok: true }); });
app.use('/internal/cron', (_req, _res, next) => { void asSystem('scheduled jobs span every PG', async () => next()); }, cronRoutes(systemPrisma));
app.use('/api', resolvePgHost(prisma));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
app.use('/api/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Proxy upload endpoint (multipart/form-data). Uploading through the API
// instead of a direct bucket URL avoids storage CORS issues on mobile browsers.
import sharp from "sharp";

const s3Upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
const allowedUploadTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif', 'image/tiff', 'application/pdf'
]);

const authorizePropertyStaffUpload = async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> => {
  const user = (req as any).user as { userId?: string; role?: string; propertyId?: string };
  if (!user.userId) {
    res.status(403).json({ message: 'Property staff access is required' });
    return;
  }
  if (user.role === 'PG_TENANT') {
    const propertyId = (req as any).pgPropertyId as string | undefined;
    if (!propertyId || (user.propertyId && user.propertyId !== propertyId)) {
      res.status(403).json({ message: 'Resident uploads must use the resident PG host' });
      return;
    }
    const account = await prisma.user.findUnique({ where: { id: user.userId }, select: { phone: true } });
    const digits = String(account?.phone || '').replace(/\D/g, '');
    const phones = [...new Set([digits, digits.length === 10 ? `91${digits}` : digits, digits.length > 10 ? digits.slice(-10) : digits])];
    const tenant = await prisma.pGTenant.findFirst({
      where: { propertyId, phone: { in: phones }, status: { in: ['RESERVED', 'ACTIVE', 'NOTICE_PERIOD'] } },
      select: { id: true }
    });
    if (!tenant) {
      res.status(403).json({ message: 'An active resident stay is required for uploads' });
      return;
    }
    return next();
  }
  if (user.role === 'PLATFORM_ADMIN') {
    const propertyId = (req as any).pgPropertyId as string | undefined;
    if (propertyId || user.propertyId) {
      res.status(403).json({ message: 'Admin uploads must run on the main host' });
      return;
    }
    return next();
  }
  if (!['PG_OWNER', 'PG_WARDEN'].includes(user.role || '')) {
    res.status(403).json({ message: 'Property staff access is required' });
    return;
  }
  const access = await prisma.pGPropertyAccess.findFirst({
    where: { userId: user.userId, role: { in: ['OWNER', 'WARDEN'] } },
    select: { id: true }
  });
  if (!access) {
    res.status(403).json({ message: 'Property staff access is required' });
    return;
  }
  next();
};

app.post('/api/upload-s3', authenticate, authorizePropertyStaffUpload, s3Upload.single('image'), rebindDbContext, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    let imageBuffer = req.file.buffer;
    let contentType = req.file.mimetype.toLowerCase();
    let finalFilename = req.file.originalname;
    if (!allowedUploadTypes.has(contentType)) {
      return res.status(400).json({ error: 'Only supported image files and PDFs may be uploaded' });
    }

    if (contentType.startsWith('image/')) {
      try {
        imageBuffer = await sharp(req.file.buffer)
          .resize({ width: 1600, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
      } catch {
        return res.status(400).json({ error: 'Image file is invalid or unsupported' });
      }
      contentType = 'image/webp';
      finalFilename = finalFilename.replace(/\.[^/.]+$/, "") + ".webp";
    } else if (imageBuffer.indexOf(Buffer.from('%PDF-')) < 0 || imageBuffer.indexOf(Buffer.from('%PDF-')) > 1024) {
      return res.status(400).json({ error: 'PDF file is invalid' });
    }

    const fileKey = newFileKey(contentType === 'application/pdf' ? 'pdf' : 'webp');
    await putFile(fileKey, imageBuffer, contentType);

    res.json({ fileKey });
  } catch (error) {
    logger.error({ err: error }, `Failed to upload to ${storageKind()} storage`);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

app.get('/api/local-media/:token', async (req, res) => {
  try {
    const payload = jwt.verify(req.params.token, getJwtSecret()) as { purpose?: string; fileKey?: string };
    if (payload.purpose !== 'LOCAL_MEDIA' || !payload.fileKey) return res.sendStatus(403);
    const filePath = localUploadPath(payload.fileKey);
    if (!filePath) return res.sendStatus(404);
    await access(filePath);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.type(filePath.endsWith('.pdf') ? 'application/pdf' : 'image/webp').sendFile(filePath, (error) => {
      if (error && !res.headersSent) res.sendStatus(500);
    });
  } catch {
    return res.sendStatus(403);
  }
});

// Direct-upload signed URL endpoint (kept for backwards compatibility)

app.post('/api/upload-url', authenticate, authorizePropertyStaffUpload, async (req, res) => {
  try {
    if (storageKind() === 'local') {
      return res.status(409).json({ message: 'Use the authenticated multipart upload endpoint for local storage' });
    }
    const { filename, mimeType } = req.body;

    if (typeof filename !== 'string' || !filename.trim() || typeof mimeType !== 'string' || !allowedUploadTypes.has(mimeType.toLowerCase())) {
      return res.status(400).json({ error: "filename and mimeType are required" });
    }

    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileKey = `uploads/${Date.now()}-${sanitizedFilename}`;

    const uploadUrl = await directUploadUrl(fileKey, mimeType.toLowerCase());

    res.json({ uploadUrl, fileKey });
  } catch (error) {
    logger.error({ err: error }, "Failed to generate upload URL");
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get(/^\/api\/view-image\/(.+)$/, authenticate, async (req, res) => {
  try {
    const fileKey = req.params[0] as string;
    const tenant = await prisma.pGTenant.findFirst({
      where: { kycDocumentUrl: fileKey },
      select: { id: true, propertyId: true, phone: true }
    });
    if (!tenant) return res.status(404).json({ message: 'Document not found' });

    const user = (req as any).user as { userId?: string; role?: string; propertyId?: string };
    const propertyId = (req as any).pgPropertyId as string | undefined;
    let hasResidentAccess = false;
    if (user.role === 'PG_TENANT' && user.userId && propertyId === tenant.propertyId && (!user.propertyId || user.propertyId === propertyId)) {
      const account = await prisma.user.findUnique({ where: { id: user.userId }, select: { phone: true } });
      const digits = String(account?.phone || '').replace(/\D/g, '');
      hasResidentAccess = [digits, digits.length === 10 ? `91${digits}` : digits, digits.length > 10 ? digits.slice(-10) : digits].includes(String(tenant.phone || '').replace(/\D/g, ''));
    }
    const hasAccess = hasResidentAccess || Boolean(user.userId && await prisma.pGPropertyAccess.findFirst({
      where: { propertyId: tenant.propertyId, userId: user.userId, role: { in: ['OWNER', 'WARDEN'] } },
      select: { id: true }
    }));
    if (!hasAccess) return res.status(403).json({ message: 'You do not have access to this document' });

    const url = await viewUrl(req, fileKey);
    if (!url) return res.status(404).json({ message: 'Document not found' });
    res.json({ viewUrl: url });
  } catch (error) {
    logger.error({ err: error }, "Failed to generate view URL");
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/api/view-image/bulk', optionalAuthenticate, async (req, res) => {
  try {
    const { keys } = req.body;
    if (!Array.isArray(keys) || keys.length > 100 || keys.some((key) => typeof key !== 'string')) {
      return res.status(400).json({ error: "keys must be an array of at most 100 strings" });
    }

    const user = (req as any).user as { userId?: string; role?: string; propertyId?: string } | undefined;
    const isAdmin = user?.role === 'PLATFORM_ADMIN' && !((req as any).pgPropertyId) && !user.propertyId;
    const staffPropertyIds = user?.userId && ['PG_OWNER', 'PG_WARDEN'].includes(user.role || '')
      ? (await prisma.pGPropertyAccess.findMany({ where: { userId: user.userId }, select: { propertyId: true } })).map((a) => a.propertyId)
      : [];

    const properties = isAdmin
      ? await asSystem('admin previews draft and active PG images', () =>
          prisma.pGProperty.findMany({
            select: { photoUrls: true, rooms: { select: { photoUrls: true } } }
          })
        )
      : await prisma.pGProperty.findMany({
          where: staffPropertyIds.length
            ? { OR: [{ status: 'ACTIVE' }, { id: { in: staffPropertyIds } }] }
            : { status: 'ACTIVE' },
          select: { photoUrls: true, rooms: { select: { photoUrls: true } } }
        });

    const publicKeys = new Set(
      properties.flatMap((property: any) => [
        ...(Array.isArray(property.photoUrls) ? property.photoUrls : []),
        ...(Array.isArray(property.rooms) ? property.rooms.flatMap((room: any) => (Array.isArray(room.photoUrls) ? room.photoUrls : [])) : [])
      ])
    );
    const allowedKeys = [...new Set(keys)].filter((key): key is string => publicKeys.has(key));
    const urls: Record<string, string> = {};
    await Promise.all(allowedKeys.map(async (fileKey) => {
      try {
        const url = await viewUrl(req, fileKey);
        if (url) urls[fileKey] = url;
      } catch (err) {
        logger.error({ err: err }, `Failed to generate url for ${fileKey}`);
      }
    }));

    res.json({ urls });
  } catch (error) {
    logger.error({ err: error }, "Failed to process bulk view URLs");
    res.status(500).json({ error: "Internal server error" });
  }
});
app.use('/api', routes);

// Optional: serve the built frontend from this service (one Cloud Run service
// for the whole app). Hashed assets are cached long-term; index.html is not.
if (process.env.FRONTEND_DIST_DIR) {
  const frontendDir = path.resolve(process.env.FRONTEND_DIST_DIR);
  app.use(express.static(frontendDir, {
    index: false,
    setHeaders: (res, filePath) => {
      res.setHeader('Cache-Control', filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
  }));
  // Single-page app: every other GET renders index.html.
  app.get(/^\/(?!(api|internal|uploads)(\/|$)|healthz?$).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendDir, 'index.html'));
  });
}

export default app;
