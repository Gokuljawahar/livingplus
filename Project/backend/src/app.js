import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import routes from './routes/index.js';
import { decryptRequest, encryptResponse } from './middleware/encryption.middleware.js';
import { authenticate } from './middleware/auth.middleware.js';
const app = express();
export const prisma = new PrismaClient();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
app.use('/api/uploads', express.static(path.resolve(__dirname, '../uploads')));
// S3 proxy upload endpoint — placed BEFORE encryption middleware
// so it can receive multipart/form-data without encryption.
// This avoids S3 CORS issues that cause failures on mobile browsers.
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
const s3Client = new S3Client({ region: process.env.S3_BUCKET_REGION || 'ap-south-1' });
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
    if (!user.userId || !['PG_OWNER', 'PG_WARDEN'].includes(user.role || '')) {
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
        const sanitizedFilename = finalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileKey = `uploads/${Date.now()}-${sanitizedFilename}`;
        const command = new PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME || 'livingplus-dev-uploads',
            Key: fileKey,
            Body: imageBuffer,
            ContentType: contentType,
        });
        await s3Client.send(command);
        res.json({ fileKey });
    }
    catch (error) {
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
// S3 presigned URL endpoints (kept for backwards compatibility)
app.post('/api/upload-url', authenticate, authorizePropertyStaffUpload, async (req, res) => {
    try {
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
    }
    catch (error) {
        console.error("Failed to generate upload URL:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
const signedUrlCache = new Map();
app.get(/^\/api\/view-image\/(.+)$/, authenticate, async (req, res) => {
    try {
        const fileKey = req.params[0];
        const tenant = await prisma.pGTenant.findFirst({
            where: { kycDocumentUrl: fileKey },
            select: { propertyId: true }
        });
        if (!tenant)
            return res.status(404).json({ message: 'Document not found' });
        const user = req.user;
        const hasAccess = user.role === 'SUPER_ADMIN' || Boolean(user.userId && await prisma.pGPropertyAccess.findFirst({
            where: { propertyId: tenant.propertyId, userId: user.userId, role: { in: ['OWNER', 'WARDEN'] } },
            select: { id: true }
        }));
        if (!hasAccess)
            return res.status(403).json({ message: 'You do not have access to this document' });
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
    }
    catch (error) {
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
        const allowedKeys = [...new Set(keys)].filter((key) => publicKeys.has(key));
        const urls = {};
        const now = Date.now();
        await Promise.all(allowedKeys.map(async (fileKey) => {
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
            }
            catch (err) {
                console.error(`Failed to generate url for ${fileKey}`, err);
            }
        }));
        res.json({ urls });
    }
    catch (error) {
        console.error("Failed to process bulk view URLs:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
app.use('/api', routes);
export default app;
//# sourceMappingURL=app.js.map