import express from 'express';
import multer from 'multer';
import { access } from 'fs/promises';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import routes from './routes/index.js';
import { authenticate } from './middleware/auth.middleware.js';
import { getJwtSecret } from './utils/auth-config.js';
import { resolvePgHost } from './middleware/pg-host.middleware.js';
import { cronRoutes } from './routes/cron.routes.js';
import { directUploadUrl, localUploadPath, newFileKey, putFile, storageKind, viewUrl } from './services/storage.js';
import { applyHttpHardening } from './middleware/http-hardening.js';
import { logger } from './utils/logger.js';
const app = express();
// Search vectors are large and internal: never returned unless selected explicitly.
export const prisma = new PrismaClient({ omit: { pGProperty: { searchEmbedding: true } } });
applyHttpHardening(app);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Liveness probe and scheduled jobs: outside /api PG host routing.
app.get('/healthz', (_req, res) => { res.json({ ok: true }); });
app.use('/internal/cron', cronRoutes(prisma));
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
const authorizePropertyStaffUpload = async (req, res, next) => {
    const user = req.user;
    if (user.role === 'SUPER_ADMIN')
        return next();
    if (!user.userId) {
        res.status(403).json({ message: 'Property staff access is required' });
        return;
    }
    if (user.role === 'PG_TENANT') {
        const propertyId = req.pgPropertyId;
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
            }
            catch {
                return res.status(400).json({ error: 'Image file is invalid or unsupported' });
            }
            contentType = 'image/webp';
            finalFilename = finalFilename.replace(/\.[^/.]+$/, "") + ".webp";
        }
        else if (imageBuffer.indexOf(Buffer.from('%PDF-')) < 0 || imageBuffer.indexOf(Buffer.from('%PDF-')) > 1024) {
            return res.status(400).json({ error: 'PDF file is invalid' });
        }
        const fileKey = newFileKey(contentType === 'application/pdf' ? 'pdf' : 'webp');
        await putFile(fileKey, imageBuffer, contentType);
        res.json({ fileKey });
    }
    catch (error) {
        logger.error({ err: error }, `Failed to upload to ${storageKind()} storage`);
        res.status(500).json({ error: "Failed to upload image" });
    }
});
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});
app.get('/api/local-media/:token', async (req, res) => {
    try {
        const payload = jwt.verify(req.params.token, getJwtSecret());
        if (payload.purpose !== 'LOCAL_MEDIA' || !payload.fileKey)
            return res.sendStatus(403);
        const filePath = localUploadPath(payload.fileKey);
        if (!filePath)
            return res.sendStatus(404);
        await access(filePath);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.type(filePath.endsWith('.pdf') ? 'application/pdf' : 'image/webp').sendFile(filePath, (error) => {
            if (error && !res.headersSent)
                res.sendStatus(500);
        });
    }
    catch {
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
    }
    catch (error) {
        logger.error({ err: error }, "Failed to generate upload URL");
        res.status(500).json({ error: "Internal server error" });
    }
});
app.get(/^\/api\/view-image\/(.+)$/, authenticate, async (req, res) => {
    try {
        const fileKey = req.params[0];
        const tenant = await prisma.pGTenant.findFirst({
            where: { kycDocumentUrl: fileKey },
            select: { id: true, propertyId: true, phone: true }
        });
        if (!tenant)
            return res.status(404).json({ message: 'Document not found' });
        const user = req.user;
        const propertyId = req.pgPropertyId;
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
        if (!hasAccess)
            return res.status(403).json({ message: 'You do not have access to this document' });
        const url = await viewUrl(req, fileKey);
        if (!url)
            return res.status(404).json({ message: 'Document not found' });
        res.json({ viewUrl: url });
    }
    catch (error) {
        logger.error({ err: error }, "Failed to generate view URL");
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
        const allowedKeys = [...new Set(keys)].filter((key) => publicKeys.has(key));
        const urls = {};
        await Promise.all(allowedKeys.map(async (fileKey) => {
            try {
                const url = await viewUrl(req, fileKey);
                if (url)
                    urls[fileKey] = url;
            }
            catch (err) {
                logger.error({ err: err }, `Failed to generate url for ${fileKey}`);
            }
        }));
        res.json({ urls });
    }
    catch (error) {
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
    app.get(/^\/(?!(api|internal|uploads)(\/|$)|healthz$).*/, (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(frontendDir, 'index.html'));
    });
}
export default app;
//# sourceMappingURL=app.js.map