import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import routes from './routes/index.js';
import { decryptRequest, encryptResponse } from './middleware/encryption.middleware.js';
const app = express();
export const prisma = new PrismaClient();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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
app.post('/api/upload-s3', s3Upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file provided" });
        }
        let imageBuffer = req.file.buffer;
        let contentType = req.file.mimetype;
        let finalFilename = req.file.originalname;
        if (contentType.startsWith('image/')) {
            imageBuffer = await sharp(req.file.buffer)
                .resize({ width: 1600, withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer();
            contentType = 'image/webp';
            finalFilename = finalFilename.replace(/\.[^/.]+$/, "") + ".webp";
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
    if (req.method !== 'GET') {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
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
app.post('/api/upload-url', async (req, res) => {
    try {
        const { filename, mimeType } = req.body;
        if (!filename || !mimeType) {
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
app.get(/^\/api\/view-image\/(.+)$/, async (req, res) => {
    try {
        const fileKey = req.params[0];
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
        if (!Array.isArray(keys)) {
            return res.status(400).json({ error: "keys array is required" });
        }
        const urls = {};
        const now = Date.now();
        await Promise.all(keys.map(async (fileKey) => {
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