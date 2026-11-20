// AudioWorkletProcessor that captures mono microphone audio in 4096-sample chunks
// and transfers them to the main thread for 16 kHz PCM16 downsampling.
// Replaces the deprecated ScriptProcessorNode in useVibeLive.ts.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(4096);
    this._offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;
    let read = 0;
    while (read < channel.length) {
      const space = this._buffer.length - this._offset;
      const take = Math.min(space, channel.length - read);
      this._buffer.set(channel.subarray(read, read + take), this._offset);
      this._offset += take;
      read += take;
      if (this._offset === this._buffer.length) {
        const out = this._buffer;
        this.port.postMessage(out, [out.buffer]);
        this._buffer = new Float32Array(4096);
        this._offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
