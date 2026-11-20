import { describe, expect, it } from 'vitest';
import { downsample, toBase64 } from './useVibeLive';

describe('useVibeLive audio helpers', () => {
  it('downsamples 48 kHz Float32 audio to 16 kHz little-endian PCM16 with clamping', () => {
    const input = new Float32Array([0, 0, 0, 1.5, 0, 0, -1.5, 0, 0]);
    const bytes = downsample(input, 48000);
    expect(bytes.byteLength).toBe(6); // 3 samples * 2 bytes
    const view = new Int16Array(bytes.buffer);
    expect(view[0]).toBe(0);
    expect(view[1]).toBe(0x7fff);
    expect(view[2]).toBe(-0x8000);
  });

  it('base64-encodes PCM bytes cleanly', () => {
    expect(toBase64(new Uint8Array([1, 2, 3, 4]))).toBe('AQIDBA==');
  });
});
