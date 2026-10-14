/** What the player has chosen, kept in this browser between visits. */
import { isBotId, type Seat } from "../bots/bots.ts";
import { DEFAULT_RULES, type Rules } from "../game/types.ts";

export type Speed = "slow" | "normal" | "fast";
export type Theme = "system" | "light" | "dark";
/** Who moves first in a new game. The first player has a big edge (see the README). */
export type First = "random" | "1" | "2";

export interface Settings {
  seats: { 1: Seat; 2: Seat };
  speed: Speed;
  theme: Theme;
  first: First;
  rules: Rules;
}

const KEY = "mancala.settings.v2";

export const DEFAULTS: Settings = {
  seats: { 1: "human", 2: "minimax" },
  speed: "normal",
  theme: "system",
  first: "random",
  rules: { ...DEFAULT_RULES },
};

/** Milliseconds per sown seed. */
export const DROP_MS: Record<Speed, number> = { slow: 350, normal: 220, fast: 100 };

const isSeat = (x: unknown): x is Seat => x === "human" || isBotId(x);

/** Loads saved settings, keeping only values that still make sense. */
export function loadSettings(): Settings {
  let saved: Partial<Settings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch { /* storage unavailable or corrupt: use the defaults */ }
  const r = saved.rules ?? DEFAULT_RULES;
  return {
    seats: {
      1: isSeat(saved.seats?.[1]) ? saved.seats[1] : DEFAULTS.seats[1],
      2: isSeat(saved.seats?.[2]) ? saved.seats[2] : DEFAULTS.seats[2],
    },
    speed: saved.speed && saved.speed in DROP_MS ? saved.speed : DEFAULTS.speed,
    theme: saved.theme === "light" || saved.theme === "dark" ? saved.theme : "system",
    first: saved.first === "1" || saved.first === "2" ? saved.first : "random",
    rules: {
      seeds: Number.isInteger(r.seeds) && r.seeds >= 3 && r.seeds <= 7 ? r.seeds : DEFAULT_RULES.seeds,
      capture: r.capture === "any" ? "any" : "own",
      clinch: typeof r.clinch === "boolean" ? r.clinch : DEFAULT_RULES.clinch,
    },
  };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* storage unavailable: settings last for this visit */ }
}

export function applyTheme(theme: Theme): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
