export interface DownscaledImage {
  blob: Blob;
  dataUrl: string;
  base64Data: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode selected image'));
    img.src = src;
  });
}

/**
 * Downscales an image in the browser so its longest side is <= maxDimension (default 1024px)
 * and re-encodes it as JPEG for Gemini Nano / Firebase AI Logic compatibility.
 */
export async function downscaleImageToJpeg(
  file: Blob,
  maxDimension = 1024,
  quality = 0.82
): Promise<DownscaledImage> {
  const sourceDataUrl = await readAsDataUrl(file);
  const img = await loadImageElement(sourceDataUrl);
  const naturalWidth = img.naturalWidth || img.width || 1;
  const naturalHeight = img.naturalHeight || img.height || 1;

  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable');
  }
  ctx.drawImage(img, 0, 0, width, height);

  const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64Data = jpegDataUrl.includes(',') ? jpegDataUrl.split(',')[1] : jpegDataUrl;
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b || file),
      'image/jpeg',
      quality
    );
  });

  return {
    blob,
    dataUrl: jpegDataUrl,
    base64Data,
    mimeType: 'image/jpeg',
    width,
    height
  };
}
