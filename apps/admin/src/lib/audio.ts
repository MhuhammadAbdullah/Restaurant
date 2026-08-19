"use client";

// Browsers refuse to play ANY audio (Web Audio oscillators included) until the page has had a
// real user gesture — an AudioContext created before that starts "suspended", and scheduling
// sound on a suspended context fails silently (no error, no sound). Two things fix this:
// 1. Reuse a single AudioContext instead of creating a fresh (suspended) one per chime.
// 2. Resume it on the very first click/keydown anywhere on the page, so it's already running by
//    the time a real notification arrives — and resume() again right before every play as a
//    defensive fallback (a cheap no-op once it's already running).

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  return ctx;
}

/** Call once near the app root — silently primes the audio context on the user's first interaction. */
export function unlockAudioOnFirstInteraction() {
  if (typeof window === "undefined") return;
  const unlock = () => {
    getContext()?.resume().catch(() => undefined);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

/** Short two-tone chime — no audio asset to ship/host. Only ever call this for a genuinely new event, never on routine polling. */
export function playChime() {
  const audioCtx = getContext();
  if (!audioCtx) return;
  audioCtx.resume().catch(() => undefined).finally(() => {
    try {
      const now = audioCtx.currentTime;
      [880, 1175].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.15);
        gain.gain.linearRampToValueAtTime(0.25, now + i * 0.15 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.3);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.3);
      });
    } catch {
      // Audio isn't available in every environment (e.g. some embedded webviews) — silently skip.
    }
  });
}
