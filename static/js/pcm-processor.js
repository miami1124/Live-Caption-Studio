class Pcm16Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pending = [];
    this.targetRate = 16000;
    this.chunkSize = 4096;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let index = 0; index < channel.length; index += 1) {
      this.pending.push(channel[index]);
    }

    while (this.pending.length >= this.chunkSize) {
      const input = this.pending.splice(0, this.chunkSize);
      const ratio = sampleRate / this.targetRate;
      const outputLength = Math.max(1, Math.floor(input.length / ratio));
      const output = new Int16Array(outputLength);

      for (let index = 0; index < outputLength; index += 1) {
        const sourcePosition = index * ratio;
        const left = Math.floor(sourcePosition);
        const right = Math.min(left + 1, input.length - 1);
        const fraction = sourcePosition - left;
        const sample = input[left] * (1 - fraction) + input[right] * fraction;
        const clipped = Math.max(-1, Math.min(1, sample));
        output[index] = clipped < 0 ? clipped * 32768 : clipped * 32767;
      }

      this.port.postMessage(output.buffer, [output.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm16-processor", Pcm16Processor);
