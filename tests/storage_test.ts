/**
 * What the game keeps in the browser: saved games (src/app/history.ts) and settings
 * (src/app/settings.ts), against localStorage (an in-memory one under Node, set up below). Each
 * test starts from empty storage.
 */
import { test } from "node:test";
import { assert, assertEquals, assertThrows } from "./assert.ts";
import { clearGames, exportGames, importGames, loadGames, recordGame, type SavedGame } from "../src/app/history.ts";
import { applyTheme, DEFAULTS, loadSettings, saveSettings, type Settings } from "../src/app/settings.ts";
import { RATINGS } from "../src/bots/ratings.ts";
import { DEFAULT_RULES, P1, P2 } from "../src/game/types.ts";

// Node has no localStorage without a flag (browsers do): an in-memory one stands in. It does what
// the game uses: getItem, setItem, removeItem, clear.
if (typeof globalThis.localStorage === "undefined") {
  const items = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return items.size;
    },
    key: (i) => [...items.keys()][i] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, String(value)),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", { value: memory, configurable: true });
}

/** A finished game as the turn loop hands it to recordGame(). */
const finished = (over: Partial<Parameters<typeof recordGame>[0]> = {}) => ({
  seats: { 1: "human", 2: "greedy" } as SavedGame["seats"],
  rules: { ...DEFAULT_RULES },
  first: P1,
  score: [52, 46] as [number, number],
  winner: P1,
  moves: [0, 9, 3],
  ...over,
});

/** A saved game, as a backup file holds it. */
const saved = (at: string): SavedGame => ({
  ...finished(),
  at,
  botElo: { 2: 1320 },
  ratingsVersion: "2026-10-15",
  rated: true,
});

function storageTest(name: string, fn: () => void) {
  test(name, () => {
    localStorage.clear();
    try {
      fn();
    } finally {
      localStorage.clear();
    }
  });
}

// --- Saved games --------------------------------------------------------------------------

storageTest("a game against a bot, standard rules, no help: rated, with the bot's rating", () => {
  const g = recordGame(finished(), null);
  assert(g.rated);
  assertEquals(g.unratedBecause, undefined);
  assertEquals(g.botElo, { 2: RATINGS.greedy.elo });
  assertEquals(loadGames().map((x) => x.at), [g.at]);
});

storageTest("unrated games say why: two people, house rules, or help along the way", () => {
  const people = recordGame(finished({ seats: { 1: "human", 2: "human" } }), null);
  const bots = recordGame(finished({ seats: { 1: "random", 2: "greedy" } }), null);
  const house = recordGame(finished({ rules: { ...DEFAULT_RULES, seeds: 5 } }), null);
  const helped = recordGame(finished(), "Undo was used");
  assertEquals(
    [people, bots, house, helped].map((g) => [g.rated, g.unratedBecause]),
    [
      [false, "not one person against a bot"],
      [false, "not one person against a bot"],
      [false, "house rules"],
      [false, "Undo was used"],
    ],
  );
  assertEquals(loadGames().length, 4);
});

storageTest("a backup exports, clears and imports back, and the same game isn't added twice", () => {
  recordGame(finished(), null);
  recordGame(finished({ first: P2 }), "a Hint was used");
  const backup = exportGames();
  assertEquals(JSON.parse(backup).app, "mancala");
  clearGames();
  assertEquals(loadGames(), []);
  assertEquals(importGames(backup), 2);
  assertEquals(importGames(backup), 0, "importing the same backup again adds nothing");
  assertEquals(loadGames().length, 2);
});

storageTest("import takes a bare list too, sorts by time, and skips things that aren't games", () => {
  const added = importGames(JSON.stringify([saved("2026-10-02T00:00:00Z"), { at: 5 }, saved("2026-10-01T00:00:00Z")]));
  assertEquals(added, 2);
  assertEquals(loadGames().map((g) => g.at), ["2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z"]);
});

storageTest("a file that isn't a backup is refused", () => {
  assertThrows(() => importGames(JSON.stringify({ hello: "world" })), Error, "not a Mancala backup");
  assertThrows(() => importGames("not json"));
});

storageTest("only the latest 500 games are kept", () => {
  const many = Array.from({ length: 510 }, (_, k) => saved(new Date(Date.UTC(2026, 0, 1, 0, k)).toISOString()));
  importGames(JSON.stringify(many));
  const kept = loadGames();
  assertEquals(kept.length, 500);
  assertEquals(kept[0].at, many[10].at, "the oldest ten are the ones dropped");
});

storageTest("corrupt or odd storage reads as no games", () => {
  localStorage.setItem("mancala.history.v1", "{not json");
  assertEquals(loadGames(), []);
  localStorage.setItem("mancala.history.v1", JSON.stringify({ games: [] }));
  assertEquals(loadGames(), []);
});

// --- Settings -----------------------------------------------------------------------------

storageTest("settings start from the defaults: Random to play, sound off, the device's theme", () => {
  const s = loadSettings();
  assertEquals(s, DEFAULTS);
  assertEquals([s.seats[2], s.sound, s.theme], ["random", false, "system"]);
});

storageTest("settings round-trip through storage", () => {
  const s: Settings = {
    ...DEFAULTS,
    seats: { 1: "minimax", 2: "human" },
    speed: "fast",
    theme: "dark",
    first: "2",
    sound: true,
    rules: { seeds: 12, capture: "any", clinch: false },
  };
  saveSettings(s);
  assertEquals(loadSettings(), s);
});

storageTest("bad saved settings fall back value by value", () => {
  localStorage.setItem(
    "mancala.settings.v2",
    JSON.stringify({
      seats: { 1: "nobody", 2: "greedy" },
      speed: "warp",
      theme: "neon",
      first: "3",
      sound: "yes",
      rules: { seeds: 40, capture: "sideways", clinch: "maybe" },
    }),
  );
  const s = loadSettings();
  assertEquals(s.seats, { 1: DEFAULTS.seats[1], 2: "greedy" }, "a good value survives beside a bad one");
  assertEquals([s.speed, s.theme, s.first, s.sound], [DEFAULTS.speed, "system", "random", false]);
  assertEquals(s.rules, { seeds: DEFAULT_RULES.seeds, capture: "own", clinch: DEFAULT_RULES.clinch });
  localStorage.setItem("mancala.settings.v2", "{broken");
  assertEquals(loadSettings(), DEFAULTS);
});

test("applyTheme sets or clears the page's theme", () => {
  const root = { dataset: {} as Record<string, string> };
  const page = globalThis as unknown as { document?: unknown };
  const before = page.document;
  page.document = { documentElement: root };
  try {
    applyTheme("dark");
    assertEquals(root.dataset.theme, "dark");
    applyTheme("system");
    assertEquals(root.dataset.theme, undefined);
  } finally {
    page.document = before;
  }
});

storageTest("storage that refuses to write loses nothing but the save", () => {
  // Full, or blocked by the browser: the game carries on, and nothing is thrown.
  const { setItem, removeItem } = localStorage;
  const refuse = () => {
    throw new Error("QuotaExceededError");
  };
  Object.assign(localStorage, { setItem: refuse, removeItem: refuse });
  try {
    recordGame(finished(), null);
    saveSettings(DEFAULTS);
    clearGames();
    assertEquals(loadGames(), []);
  } finally {
    Object.assign(localStorage, { setItem, removeItem });
  }
});
