// Voice recordings as 16 kHz mono WAV: every browser can make it from its own
// recording format, and Gemini accepts it everywhere.
export async function blobToWav16k(blob: Blob): Promise<Blob> {
  const raw = await blob.arrayBuffer();
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();
  try {
    const audio = await ctx.decodeAudioData(raw);
    const targetRate = 16000;
    const channels: Float32Array[] = [];
    for (let c = 0; c < audio.numberOfChannels; c += 1) channels.push(audio.getChannelData(c));
    const ratio = audio.sampleRate / targetRate;
    const len = Math.floor(audio.length / ratio);
    const pcm = new Int16Array(len);
    for (let i = 0; i < len; i += 1) {
      let sample = 0;
      for (const channel of channels) sample += channel[Math.floor(i * ratio)] || 0;
      sample /= channels.length || 1;
      const clamped = Math.max(-1, Math.min(1, sample));
      pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const writeAscii = (offset: number, text: string) => {
      for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
    };
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, 'data');
    view.setUint32(40, pcm.byteLength, true);
    return new Blob([header, pcm.buffer as ArrayBuffer], { type: 'audio/wav' });
  } finally {
    void ctx.close();
  }
}
