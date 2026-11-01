import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new Error('ENCRYPTION_KEY must be configured as 64 hexadecimal characters');
  }
  return Buffer.from(keyHex, 'hex');
}

function decrypt(encryptedData: string): unknown {
  const combined = Buffer.from(encryptedData, 'base64');
  const iv = combined.subarray(0, 16);
  const ciphertext = combined.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

export function encryptData(data: unknown): string {
  const json = JSON.stringify(data);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

export function decryptRequest(req: Request, res: Response, next: NextFunction): void {
  // Decrypt request body (POST, PUT, PATCH)
  if (req.body && typeof req.body.data === 'string') {
    try {
      req.body = decrypt(req.body.data);
    } catch {
      res.status(400).json({ error: 'Invalid encrypted payload' });
      return;
    }
  }

  // Decrypt query params (GET and any request with params)
  if (req.query && typeof req.query.data === 'string') {
    try {
      const decryptedQuery = decrypt(req.query.data);
      Object.defineProperty(req, 'query', {
        value: decryptedQuery,
        writable: true,
        enumerable: true,
        configurable: true
      });
    } catch (err: any) {
      console.error('Failed to decrypt query:', err?.message, 'Raw query.data:', req.query.data);
      res.status(400).json({ error: 'Invalid encrypted query', message: err?.message });
      return;
    }
  }

  next();
}

export function encryptResponse(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  (res as any).json = function (data: unknown) {
    return originalJson({ data: encryptData(data) });
  };
  next();
}
