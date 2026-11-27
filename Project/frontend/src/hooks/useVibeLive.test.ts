import { describe, expect, it } from 'vitest';
import { downsample, liveUrl, toBase64 } from './useVibeLive';

describe('useVibeLive audio helpers', () => {
  it('downsamples 48 kHz Float32 audio with anti-aliased box averaging and PCM16 clamping', () => {
    const input = new Float32Array([0, 0, 0, 1.5, 1.5, 1.5, -1.5, -1.5, -1.5]);
    const bytes = downsample(input, 48000);
    expect(bytes.byteLength).toBe(6); // 3 samples * 2 bytes
    const view = new Int16Array(bytes.buffer);
    expect(view[0]).toBe(0);
    expect(view[1]).toBe(0x7fff);
    expect(view[2]).toBe(-0x8000);
  });

  it('passes through native 16 kHz Float32 audio cleanly without distortion', () => {
    const input = new Float32Array([0, 0.5, -0.5]);
    const bytes = downsample(input, 16000);
    const view = new Int16Array(bytes.buffer);
    expect(view[0]).toBe(0);
    expect(view[1]).toBe(Math.floor(0.5 * 0x7fff));
    expect(view[2]).toBe(-0.5 * 0x8000);
  });

  it('base64-encodes PCM bytes cleanly', () => {
    expect(toBase64(new Uint8Array([1, 2, 3, 4]))).toBe('AQIDBA==');
  });

  it('requests binary PCM WebSocket streaming via binary=1', () => {
    const url = liveUrl('prop-123');
    expect(url).toContain('/api/pg/vibecheck/live?');
    expect(url).toContain('binary=1');
    expect(url).toContain('propertyId=prop-123');
  });
});
