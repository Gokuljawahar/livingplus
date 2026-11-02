import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { access, mkdir, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import routes from './routes/index.js';
import { decryptRequest, encryptResponse } from './middleware/encryption.middleware.js';
import { authenticate } from './middleware/auth.middleware.js';
import { getJwtSecret } from './utils/auth-config.js';
import { resolvePgHost } from './middleware/pg-host.middleware.js';

const app = express();
export const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/api', resolvePgHost(prisma));
const uploadStorage = process.env.UPLOAD_STORAGE === 's3' ? 's3' : 'local';
const localUploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, '../private-uploads');
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
app.use('/api/uploads', express.static(path.resolve(__dirname, '../uploads')));

// S3 proxy upload endpoint — placed BEFORE encryption middleware
// so it can receive multipart/form-data without encryption.
// This avoids S3 CORS issues that cause failures on mobile browsers.
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";

const s3Client = new S3Client({ region: process.env.S3_BUCKET_REGION || 'ap-south-1' });

function localUploadPath(fileKey: string): string | null {
  const match = /^local\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(webp|pdf)$/i.exec(fileKey);
  return match ? path.join(localUploadDir, `${match[1]}.${match[2]}`) : null;
}

function localMediaUrl(req: express.Request, fileKey: string): string {
  const token = jwt.sign({ purpose: 'LOCAL_MEDIA', fileKey }, getJwtSecret(), { expiresIn: '1h' });
  const apiOrigin = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`;
  return `${apiOrigin.replace(/\/$/, '')}/api/local-media/${token}`;
}

const s3Upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
const allowedUploadTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif', 'image/tiff', 'application/pdf'
]);

const authorizePropertyStaffUpload = async (req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> => {
  const user = (req as any).user as { userId?: string; role?: string; propertyId?: string };
  if (user.role === 'SUPER_ADMIN') return next();
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
      where: { propertyId, phone: { in: phones }, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
      select: { id: true }
    });
    if (!tenant) {
      res.status(403).json({ message: 'An active resident stay is required for uploads' });
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

app.post('/api/upload-s3', authenticate, authorizePropertyStaffUpload, s3Upload.single('image'), async (req, res) => {
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

    const fileKey = uploadStorage === 'local'
      ? `local/${randomUUID()}.${contentType === 'application/pdf' ? 'pdf' : 'webp'}`
      : `uploads/${Date.now()}-${randomUUID()}.${contentType === 'application/pdf' ? 'pdf' : 'webp'}`;

    if (uploadStorage === 'local') {
      await mkdir(localUploadDir, { recursive: true });
      await writeFile(localUploadPath(fileKey)!, imageBuffer, { flag: 'wx', mode: 0o600 });
    } else {
      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fileKey,
        Body: imageBuffer,
        ContentType: contentType,
      });
      await s3Client.send(command);
    }

    res.json({ fileKey });
  } catch (error) {
    console.error("Failed to upload to S3:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

app.use(decryptRequest);
app.use(encryptResponse);

// Request Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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

// S3 presigned URL endpoints (kept for backwards compatibility)

app.post('/api/upload-url', authenticate, authorizePropertyStaffUpload, async (req, res) => {
  try {
    if (uploadStorage !== 's3') {
      return res.status(409).json({ message: 'Use the authenticated multipart upload endpoint for local storage' });
    }
    const { filename, mimeType } = req.body;

    if (typeof filename !== 'string' || !filename.trim() || typeof mimeType !== 'string' || !allowedUploadTypes.has(mimeType.toLowerCase())) {
      return res.status(400).json({ error: "filename and mimeType are required" });
    }

    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileKey = `uploads/${Date.now()}-${sanitizedFilename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'livingplus-dev-uploads',
      Key: fileKey,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    res.json({ uploadUrl, fileKey });
  } catch (error) {
    console.error("Failed to generate upload URL:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const signedUrlCache = new Map<string, { url: string, expiresAt: number }>();

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
    const hasAccess = user.role === 'SUPER_ADMIN' || hasResidentAccess || Boolean(user.userId && await prisma.pGPropertyAccess.findFirst({
      where: { propertyId: tenant.propertyId, userId: user.userId, role: { in: ['OWNER', 'WARDEN'] } },
      select: { id: true }
    }));
    if (!hasAccess) return res.status(403).json({ message: 'You do not have access to this document' });

    if (uploadStorage === 'local') {
      const filePath = localUploadPath(fileKey);
      if (!filePath) return res.status(404).json({ message: 'Document not found' });
      try {
        await access(filePath);
      } catch {
        return res.status(404).json({ message: 'Document not found' });
      }
      return res.json({ viewUrl: localMediaUrl(req, fileKey) });
    }

    const now = Date.now();

    const cached = signedUrlCache.get(fileKey);
    if (cached && cached.expiresAt > now) {
      return res.json({ viewUrl: cached.url });
    }

    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'livingplus-dev-uploads',
      Key: fileKey,
    });

    const viewUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    signedUrlCache.set(fileKey, { url: viewUrl, expiresAt: now + 50 * 60 * 1000 });

    res.json({ viewUrl });
  } catch (error) {
    console.error("Failed to generate view URL:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/api/view-image/bulk', async (req, res) => {
  try {
    const { keys } = req.body;
    if (!Array.isArray(keys) || keys.length > 100 || keys.some((key) => typeof key !== 'string')) {
      return res.status(400).json({ error: "keys must be an array of at most 100 strings" });
    }

    const properties = await prisma.pGProperty.findMany({
      where: { status: 'ACTIVE' },
      select: { photoUrls: true }
    });
    const publicKeys = new Set(properties.flatMap((property) => Array.isArray(property.photoUrls) ? property.photoUrls : []));
    const allowedKeys = [...new Set(keys)].filter((key): key is string => publicKeys.has(key));
    const urls: Record<string, string> = {};
    const now = Date.now();

    if (uploadStorage === 'local') {
      await Promise.all(allowedKeys.map(async (fileKey) => {
        const filePath = localUploadPath(fileKey);
        if (!filePath) return;
        try {
          await access(filePath);
          urls[fileKey] = localMediaUrl(req, fileKey);
        } catch {
          return;
        }
      }));
      return res.json({ urls });
    }

    await Promise.all(
      allowedKeys.map(async (fileKey) => {
        try {
          const cached = signedUrlCache.get(fileKey);
          if (cached && cached.expiresAt > now) {
            urls[fileKey] = cached.url;
            return;
          }

          const command = new GetObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME || 'livingplus-dev-uploads',
            Key: fileKey,
          });
          const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
          signedUrlCache.set(fileKey, { url, expiresAt: now + 50 * 60 * 1000 });
          urls[fileKey] = url;
        } catch (err) {
          console.error(`Failed to generate url for ${fileKey}`, err);
        }
      })
    );

    res.json({ urls });
  } catch (error) {
    console.error("Failed to process bulk view URLs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.use('/api', routes);

export default app;
