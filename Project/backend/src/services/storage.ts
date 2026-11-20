// Private file storage behind one interface: local disk (development), Google
// Cloud Storage (Cloud Run), or S3. Files are never public: viewers get
// short-lived signed URLs after the API has checked access.
//
// UPLOAD_STORAGE=local  -> UPLOAD_DIR (default backend/private-uploads)
// UPLOAD_STORAGE=gcs    -> GCS_BUCKET; credentials from Google ADC. On Cloud Run
//                          the service account signs URLs via the IAM API, so it
//                          needs roles/iam.serviceAccountTokenCreator on itself.
// UPLOAD_STORAGE=s3     -> S3_BUCKET_NAME, S3_BUCKET_REGION, AWS credentials
// Unset: gcs when GCS_BUCKET is set, s3 when S3_BUCKET_NAME is set, else local.
import { access, mkdir, readFile as readLocalFile, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { getJwtSecret } from '../utils/auth-config.js';

export type StorageKind = 'local' | 'gcs' | 's3';

export const storageKind = (): StorageKind => {
  const value = process.env.UPLOAD_STORAGE;
  if (value === 's3' || value === 'gcs' || value === 'local') return value;
  // A configured bucket means Cloud Storage: never fall back to the container's
  // disk there, which Cloud Run wipes on restart and does not share between instances.
  if (process.env.GCS_BUCKET) return 'gcs';
  if (process.env.S3_BUCKET_NAME) return 's3';
  return 'local';
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localUploadDir = (): string => (process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.resolve(__dirname, '../../private-uploads'));

const LOCAL_KEY_RE = /^local\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(webp|pdf)$/i;

export function localUploadPath(fileKey: string): string | null {
  const match = LOCAL_KEY_RE.exec(fileKey);
  return match ? path.join(localUploadDir(), `${match[1]}.${match[2]}`) : null;
}

export function newFileKey(extension: 'webp' | 'pdf'): string {
  return storageKind() === 'local' ? `local/${randomUUID()}.${extension}` : `uploads/${Date.now()}-${randomUUID()}.${extension}`;
}

const VIEW_URL_TTL_MS = 60 * 60 * 1000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

// Minimal shapes of the cloud SDK objects we use, so tests can inject fakes.
export interface GcsFileLike {
  save(data: Buffer, options: { contentType: string; resumable: boolean }): Promise<unknown>;
  getSignedUrl(options: { version: 'v4'; action: 'read' | 'write'; expires: number; contentType?: string }): Promise<[string]>;
  download?(): Promise<[Buffer]>;
}
export interface GcsBucketLike {
  file(name: string): GcsFileLike;
}

let gcsBucketOverride: GcsBucketLike | null = null;
let gcsBucketCache: GcsBucketLike | null = null;

/** Test hook: replace the Cloud Storage bucket with a fake (null restores). */
export function setGcsBucketForTests(bucket: GcsBucketLike | null): void {
  gcsBucketOverride = bucket;
  signedUrlCache.clear();
}

async function gcsBucket(): Promise<GcsBucketLike> {
  if (gcsBucketOverride) return gcsBucketOverride;
  if (!gcsBucketCache) {
    const bucketName = process.env.GCS_BUCKET;
    if (!bucketName) throw new Error('GCS_BUCKET is not configured');
    const { Storage } = await import('@google-cloud/storage');
    gcsBucketCache = new Storage().bucket(bucketName) as unknown as GcsBucketLike;
  }
  return gcsBucketCache;
}

let s3ClientCache: any = null;
async function s3() {
  const sdk = await import('@aws-sdk/client-s3');
  const presigner = await import('@aws-sdk/s3-request-presigner');
  if (!s3ClientCache) s3ClientCache = new sdk.S3Client({ region: process.env.S3_BUCKET_REGION || 'ap-south-1' });
  return { sdk, presigner, client: s3ClientCache, bucket: process.env.S3_BUCKET_NAME || 'livingplus-dev-uploads' };
}

/** Stores a validated file under fileKey. Local writes never overwrite. */
export async function putFile(fileKey: string, data: Buffer, contentType: string): Promise<void> {
  const kind = storageKind();
  if (kind === 'local') {
    const filePath = localUploadPath(fileKey);
    if (!filePath) throw new Error('INVALID_FILE_KEY');
    await mkdir(localUploadDir(), { recursive: true });
    await writeFile(filePath, data, { flag: 'wx', mode: 0o600 });
    return;
  }
  if (kind === 'gcs') {
    await (await gcsBucket()).file(fileKey).save(data, { contentType, resumable: false });
    return;
  }
  const { sdk, client, bucket } = await s3();
  await client.send(new sdk.PutObjectCommand({ Bucket: bucket, Key: fileKey, Body: data, ContentType: contentType }));
}

/** Reads a stored file back (for server-side checks such as AI KYC reading). */
export async function readStoredFile(fileKey: string): Promise<{ data: Buffer; contentType: string }> {
  const contentType = /\.pdf$/i.test(fileKey) ? 'application/pdf' : /\.png$/i.test(fileKey) ? 'image/png' : /\.jpe?g$/i.test(fileKey) ? 'image/jpeg' : 'image/webp';
  const kind = storageKind();
  if (kind === 'local') {
    const filePath = localUploadPath(fileKey);
    if (!filePath) throw new Error('INVALID_FILE_KEY');
    return { data: await readLocalFile(filePath), contentType };
  }
  if (kind === 'gcs') {
    const file = (await gcsBucket()).file(fileKey);
    if (!file.download) throw new Error('DOWNLOAD_UNSUPPORTED');
    const [data] = await file.download();
    return { data, contentType };
  }
  const { sdk, client, bucket } = await s3();
  const object = await client.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: fileKey }));
  return { data: Buffer.from(await object.Body.transformToByteArray()), contentType: object.ContentType || contentType };
}

function localMediaUrl(req: Request, fileKey: string): string {
  const token = jwt.sign({ purpose: 'LOCAL_MEDIA', fileKey }, getJwtSecret(), { expiresIn: '1h' });
  const apiOrigin = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`;
  return `${apiOrigin.replace(/\/$/, '')}/api/local-media/${token}`;
}

/**
 * A short-lived URL to view an already-authorized file, or null when the file
 * does not exist (local storage) or cannot be signed.
 */
export async function viewUrl(req: Request, fileKey: string): Promise<string | null> {
  const kind = storageKind();
  if (kind === 'local') {
    const filePath = localUploadPath(fileKey);
    if (!filePath) return null;
    try {
      await access(filePath);
    } catch {
      return null;
    }
    return localMediaUrl(req, fileKey);
  }

  const now = Date.now();
  const cacheKey = `${kind}:${fileKey}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.url;

  let url: string;
  if (kind === 'gcs') {
    [url] = await (await gcsBucket()).file(fileKey).getSignedUrl({ version: 'v4', action: 'read', expires: now + VIEW_URL_TTL_MS });
  } else {
    const { sdk, presigner, client, bucket } = await s3();
    url = await presigner.getSignedUrl(client, new sdk.GetObjectCommand({ Bucket: bucket, Key: fileKey }), { expiresIn: VIEW_URL_TTL_MS / 1000 });
  }
  // Reuse for 50 of the 60 minutes so clients never get an almost-expired URL.
  signedUrlCache.set(cacheKey, { url, expiresAt: now + 50 * 60 * 1000 });
  return url;
}

/** A signed direct-upload URL (cloud storage only; local uses the proxy upload). */
export async function directUploadUrl(fileKey: string, contentType: string): Promise<string> {
  const kind = storageKind();
  if (kind === 'gcs') {
    const [url] = await (await gcsBucket()).file(fileKey).getSignedUrl({ version: 'v4', action: 'write', expires: Date.now() + 15 * 60 * 1000, contentType });
    return url;
  }
  if (kind === 's3') {
    const { sdk, presigner, client, bucket } = await s3();
    return presigner.getSignedUrl(client, new sdk.PutObjectCommand({ Bucket: bucket, Key: fileKey, ContentType: contentType }), { expiresIn: 900 });
  }
  throw new Error('DIRECT_UPLOAD_UNSUPPORTED');
}
