/**
 * לכידת מיקרופון 16kHz — איגוד למנות ~100ms כדי לא להציף את ה-WebSocket.
 */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pending = new Float32Array(0);
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input?.length) return true;

    const rate = sampleRate || 16000;
    const frameSamples = Math.max(640, Math.round(rate * 0.1));

    const merged = new Float32Array(this.pending.length + input.length);
    merged.set(this.pending);
    merged.set(input, this.pending.length);

    let offset = 0;
    while (offset + frameSamples <= merged.length) {
      this.port.postMessage({
        type: "audio",
        data: merged.subarray(offset, offset + frameSamples),
      });
      offset += frameSamples;
    }

    this.pending = merged.subarray(offset);
    return true;
  }
}

registerProcessor("gemini-live-capture", CaptureProcessor);
