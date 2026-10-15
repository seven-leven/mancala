/**
 * Small wooden sounds, made with Web Audio (no files): a tock for each seed, a two-note chime
 * for a capture, a rising one for a free turn, and three notes when the game ends.
 * Off unless the player turns it on in Settings.
 */
let ctx: AudioContext | null = null;
let enabled = false;

export function setSound(on: boolean): void {
  enabled = on;
  // Browsers only allow audio after a click or key press; turning it on is one.
  if (on && !ctx) ctx = new AudioContext();
  if (on && ctx?.state === "suspended") void ctx.resume();
}

function tone(freq: number, at: number, length: number, volume: number, type: OscillatorType = "triangle"): void {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

export const sound = {
  /** A seed lands: pitch rises around the board, so a long sow climbs. */
  drop(pit: number): void {
    tone(260 + (pit % 16) * 14, 0, 0.07, 0.06);
  },
  capture(): void {
    tone(523, 0, 0.18, 0.08, "sine");
    tone(784, 0.09, 0.24, 0.07, "sine");
  },
  freeTurn(): void {
    tone(440, 0, 0.12, 0.06, "sine");
    tone(660, 0.07, 0.18, 0.06, "sine");
  },
  gameOver(): void {
    [392, 494, 587].forEach((f, i) => tone(f, i * 0.12, 0.3, 0.07, "sine"));
  },
};
