class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.port.onmessage = (event) => {
      if (event.data === "interrupt") {
        this.buffer = [];
      } else if (event.data instanceof Float32Array) {
        this.buffer.push(...event.data);
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      channel[i] = this.buffer.shift() || 0;
    }
    return true;
  }
}

registerProcessor("gemini-live-playback", PlaybackProcessor);
