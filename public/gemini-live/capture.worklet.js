class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      // We send a copy of the data because the buffer might be reused
      this.port.postMessage({ 
        type: "audio", 
        data: new Float32Array(channelData) 
      });
    }
    return true;
  }
}

registerProcessor("gemini-live-capture", CaptureProcessor);
