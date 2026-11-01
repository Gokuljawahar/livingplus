const KEY_HEX = import.meta.env.VITE_ENCRYPTION_KEY as string;

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function getKey(): Promise<CryptoKey> {
  if (!KEY_HEX) throw new Error('VITE_ENCRYPTION_KEY is not set');
  return crypto.subtle.importKey(
    'raw',
    hexToBytes(KEY_HEX),
    { name: 'AES-CBC' },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function encrypt(data: unknown): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, encoded);

  const combined = new Uint8Array(16 + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), 16);
  return bufferToBase64(combined.buffer);
}

export async function decrypt(base64: string): Promise<unknown> {
  const key = await getKey();
  const combined = base64ToBytes(base64);
  const iv = combined.slice(0, 16);
  const ciphertext = combined.slice(16);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(decrypted));
}
