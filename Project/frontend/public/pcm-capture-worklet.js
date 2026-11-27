// AudioWorkletProcessor that captures mono microphone audio, applies box-averaged
// downsampling if hardware sampleRate differs from targetSampleRate (16 kHz),
// and transfers clamped 1024-sample Int16 PCM buffers zero-copy to main thread.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._targetRate = options?.processorOptions?.targetSampleRate || 16000;
    this._chunkSize = 1024;
    this._pcm = new Int16Array(this._chunkSize);
    this._offset = 0;
    this._ratio = sampleRate > this._targetRate ? sampleRate / this._targetRate : 1;
    this._sum = 0;
    this._count = 0;
    this._acc = 0;
  }

  _pushSample(sample) {
    const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
    this._pcm[this._offset] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    this._offset += 1;
    if (this._offset === this._chunkSize) {
      const out = this._pcm;
      this.port.postMessage(out.buffer, [out.buffer]);
      this._pcm = new Int16Array(this._chunkSize);
      this._offset = 0;
    }
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;

    if (Math.abs(this._ratio - 1) < 0.01) {
      for (let i = 0; i < channel.length; i += 1) {
        this._pushSample(channel[i]);
      }
      return true;
    }

    for (let i = 0; i < channel.length; i += 1) {
      this._sum += channel[i];
      this._count += 1;
      this._acc += 1;
      if (this._acc >= this._ratio) {
        this._pushSample(this._sum / this._count);
        this._sum = 0;
        this._count = 0;
        this._acc -= this._ratio;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
