import { randomBytes } from 'crypto';

let developmentSecret: string | undefined;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret && process.env.NODE_ENV !== 'production') {
    developmentSecret ??= randomBytes(32).toString('hex');
    return developmentSecret;
  }
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 bytes before starting the API');
  }
  return secret;
}