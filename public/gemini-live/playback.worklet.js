/**
 * השמעת PCM 24kHz עם buffer מראש (מפחית שתיקות/קטיעות ברשת).
 */
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** @type {Float32Array[]} */
    this.queue = [];
    this.queueLength = 0;
    /** ~150ms ב-24kHz לפני תחילת השמעה */
    this.minPrimeSamples = 3600;
    this.primed = false;
    this.port.onmessage = (event) => {
      if (event.data === "interrupt") {
        this.queue = [];
        this.queueLength = 0;
        this.primed = false;
        return;
      }
      if (event.data instanceof Float32Array && event.data.length > 0) {
        this.queue.push(event.data);
        this.queueLength += event.data.length;
      }
    };
  }

  process(_inputs, outputs) {
    const channel = outputs[0]?.[0];
    if (!channel) return true;

    if (!this.primed) {
      if (this.queueLength < this.minPrimeSamples) {
        channel.fill(0);
        return true;
      }
      this.primed = true;
    }

    let offset = 0;
    while (offset < channel.length) {
      if (this.queue.length === 0) {
        channel.fill(0, offset);
        break;
      }

      const head = this.queue[0];
      const take = Math.min(head.length, channel.length - offset);
      channel.set(head.subarray(0, take), offset);

      if (take >= head.length) {
        this.queue.shift();
        this.queueLength -= head.length;
      } else {
        this.queue[0] = head.subarray(take);
        this.queueLength -= take;
      }
      offset += take;
    }

    return true;
  }
}

registerProcessor("gemini-live-playback", PlaybackProcessor);
