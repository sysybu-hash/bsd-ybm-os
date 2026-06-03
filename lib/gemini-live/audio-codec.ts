/**
 * Pure browser audio encoding/decoding utilities for the Gemini Live integration.
 * Extracted from hooks/useGeminiLiveAudio to keep that hook focused on React state.
 */

/** Converts an ArrayBuffer to a base-64 string (browser only). */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  return window.btoa(binary);
}

/** Converts a Float32 PCM sample array to a 16-bit PCM ArrayBuffer. */
export function float32ToPcm16(float32: Float32Array): ArrayBuffer {
  const pcm = new Int16Array(float32.length);
  for (let index = 0; index < float32.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32[index]!));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return pcm.buffer;
}

/** Converts a base-64 encoded PCM-16 string to a Float32Array. */
export function base64PcmToFloat32(base64Audio: string): Float32Array {
  const binary = window.atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const pcm = new Int16Array(bytes.buffer);
  const audio = new Float32Array(pcm.length);
  for (let index = 0; index < pcm.length; index += 1) {
    audio[index] = pcm[index]! / 32768;
  }
  return audio;
}

/** Returns the available AudioContext constructor (handles webkit prefix). */
export function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const win = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext || win.webkitAudioContext || null;
}

/** Resumes a suspended AudioContext, silently ignoring errors. */
export async function resumeAudioContext(ctx: AudioContext | null | undefined): Promise<void> {
  if (!ctx || ctx.state === "closed") return;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
}
