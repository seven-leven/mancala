/** Starts the game and wires the page: menus, settings, the rules dialog and the keyboard. */
import { type BotId, BOTS, isBotId, type Seat } from "./bots/bots.ts";
import { RATINGS } from "./bots/ratings.ts";
import { Game } from "./app/game.ts";
import { applyTheme, loadSettings, saveSettings, type Settings } from "./app/settings.ts";
import { BoardView } from "./ui/board.ts";
import { setSound } from "./ui/sound.ts";
import { renderStats } from "./ui/stats.ts";
import { Picker, type PickerGroup } from "./ui/picker.ts";
import { clearGames, exportGames, gamesToMgn, importGames, loadGames, playerStats } from "./app/history.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el as T;
};

const settings = loadSettings();
applyTheme(settings.theme);

// --- Theme: one button in the masthead -------------------------------------------------
// Until it's pressed the page follows the device ("system"); a press picks the other of light
// and dark and keeps it. It shows what a press does: a moon in the light theme, a sun in the dark.
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const shownTheme = () => (settings.theme === "system" ? (systemDark.matches ? "dark" : "light") : settings.theme);
const themeButton = $<HTMLButtonElement>("toggleTheme");
function showThemeButton(): void {
  const dark = shownTheme() === "dark";
  themeButton.setAttribute("aria-label", `Switch to the ${dark ? "light" : "dark"} theme`);
  themeButton.querySelector("use")!.setAttribute(
    "href",
    themeButton.querySelector("use")!.getAttribute("href")!.replace(/#.*$/, dark ? "#sun" : "#moon"),
  );
}
themeButton.addEventListener("click", () => {
  settings.theme = shownTheme() === "dark" ? "light" : "dark";
  saveSettings(settings);
  applyTheme(settings.theme);
  showThemeButton();
});
systemDark.addEventListener("change", showThemeButton);
showThemeButton();

const game = new Game(new BoardView($("board")), {
  turn: $("turn"),
  turnText: $("turnText"),
  turnNote: $("turnNote"),
  score: { 1: $("score1"), 2: $("score2") },
  name: { 1: $("name1"), 2: $("name2") },
  hand: $("hand"),
  toast: $("toast"),
  log: $<HTMLOListElement>("log"),
  moveCount: $("moveCount"),
  undo: $<HTMLButtonElement>("undo"),
  hint: $<HTMLButtonElement>("hint"),
  skip: $<HTMLButtonElement>("skip"),
  replay: $<HTMLButtonElement>("replay"),
}, settings);

// --- Menus -----------------------------------------------------------------------------

const bots = Object.entries(BOTS) as [BotId, (typeof BOTS)[BotId]][];
/** "Expert · Minimax · 1908": the everyday level, the algorithm, and its Elo from the tournament. */
const botLabel = (id: BotId) => {
  const b = BOTS[id];
  const elo = RATINGS[id]?.elo;
  return `${b.level} · ${b.label}${elo ? ` · ${elo}` : ""}`;
};
const option = (value: string, label: string) =>
  Object.assign(document.createElement("option"), { value, textContent: label });

/** Strength bands for the opponent picker, by Elo. Named so they never clash with a level name. */
const BANDS = [
  { label: "Strong", range: "1600+", min: 1600 },
  { label: "Club", range: "1250–1600", min: 1250 },
  { label: "Learner", range: "900–1250", min: 900 },
  { label: "Starter", range: "under 900", min: -Infinity },
];
const ranked = bots.map(([id]) => id).sort((a, b) => (RATINGS[b]?.elo ?? 0) - (RATINGS[a]?.elo ?? 0));
const groups: PickerGroup[] = [
  { items: [{ value: "human", title: "A friend", detail: "same screen", note: "2 players" }] },
  ...BANDS.map((band, i) => ({
    label: band.label,
    range: band.range,
    items: ranked
      .filter((id) => {
        const elo = RATINGS[id]?.elo ?? 0;
        return elo >= band.min && (i === 0 || elo < BANDS[i - 1].min);
      })
      .map((id) => ({ value: id, title: BOTS[id].level, detail: BOTS[id].label, elo: RATINGS[id]?.elo })),
  })).filter((g) => g.items.length),
];

/** The quick opponent picker sets Player 2. */
const opponent = new Picker($("opponent"), "Opponent", groups, (v) => {
  setSeat(2, v === "human" || isBotId(v) ? v : "random");
  // A new opponent once moves are on the board means a new game, so the result can be rated.
  if (game.started) game.start();
});

const form = $<HTMLFormElement>("settingsForm");
for (const name of ["p1", "p2"]) {
  const select = form.elements.namedItem(name) as HTMLSelectElement;
  select.append(option("human", "A person"), ...bots.map(([id]) => option(id, botLabel(id))));
}
const seedRange = form.elements.namedItem("seeds") as HTMLInputElement;
const showSeeds = () => ($("seedValue").textContent = seedRange.value);
seedRange.addEventListener("input", showSeeds);

function showSettings(s: Settings): void {
  opponent.value = s.seats[2];
  const field = (name: string) => form.elements.namedItem(name) as RadioNodeList | HTMLSelectElement;
  (field("p1") as HTMLSelectElement).value = s.seats[1];
  (field("p2") as HTMLSelectElement).value = s.seats[2];
  (field("speed") as RadioNodeList).value = s.speed;
  (field("first") as RadioNodeList).value = s.first;
  seedRange.value = String(s.rules.seeds);
  showSeeds();
  (field("capture") as RadioNodeList).value = s.rules.capture;
  (form.elements.namedItem("clinch") as HTMLInputElement).checked = s.rules.clinch;
  (form.elements.namedItem("sound") as HTMLInputElement).checked = s.sound;
  describeRules(s);
}

/** The footer and the rules dialog follow the house rules. */
function describeRules(s: Settings): void {
  const { seeds, capture, clinch } = s.rules;
  $("rulesSummary").textContent = `${seeds} seeds a pit · capture from ${
    capture === "own" ? "your own side" : "either side"
  } · ${clinch ? "ends on a clinched majority" : "played to the last seed"}`;
  $("captureRule").textContent = `Last seed lands in an empty pit ${
    capture === "own" ? "on your side" : "on either side"
  }? Bank the seeds in the pit opposite. Your last seed stays where it landed.`;
  // Minimax proves this for the standard rules (either capture side): see the README.
  const standard = seeds === 7 && clinch;
  $("firstRule").textContent = `Going first matters. ${
    standard
      ? "Opening with pit 1 starts a chain of free turns that wins before the other side ever moves."
      : "The first player has a real edge."
  } Choose who goes first in Settings.`;
  $("endRule").textContent = `The game ends when a side runs out of seeds${
    clinch ? `, or as soon as a store holds more than half of all ${14 * seeds}` : ""
  }. Each player banks what's left on their side, and the fuller store wins.`;
}

function setSeat(p: 1 | 2, seat: Seat): void {
  settings.seats[p] = seat;
  saveSettings(settings);
  showSettings(settings);
  game.settingsChanged();
}

// --- Settings dialog -------------------------------------------------------------------

const settingsDialog = $<HTMLDialogElement>("settings");
$("openSettings").addEventListener("click", () => {
  showSettings(settings);
  settingsDialog.showModal();
});
settingsDialog.addEventListener("close", () => {
  const data = new FormData(form);
  const seat = (v: FormDataEntryValue | null): Seat => (v === "human" || isBotId(v) ? v : "human");
  const before = JSON.stringify(settings.rules);
  settings.seats = { 1: seat(data.get("p1")), 2: seat(data.get("p2")) };
  settings.speed = (data.get("speed") as Settings["speed"]) ?? settings.speed;
  settings.first = (data.get("first") as Settings["first"]) ?? settings.first;
  settings.sound = data.get("sound") === "on";
  setSound(settings.sound);
  settings.rules = {
    seeds: Number(data.get("seeds")) || settings.rules.seeds,
    capture: data.get("capture") === "any" ? "any" : "own",
    clinch: data.get("clinch") === "on",
  };
  saveSettings(settings);
  showSettings(settings);
  if (JSON.stringify(settings.rules) !== before) game.start();
  else game.settingsChanged();
});

// --- Rules dialog, buttons, keys -------------------------------------------------------

const rulesDialog = $<HTMLDialogElement>("rules");
const showRules = () => rulesDialog.open || rulesDialog.showModal();
$("openRules").addEventListener("click", showRules);
$("newGame").addEventListener("click", () => game.start());
$("undo").addEventListener("click", () => game.undo());
$("hint").addEventListener("click", () => void game.hint());
$("skip").addEventListener("click", () => game.skipAhead());
$("replay").addEventListener("click", () => void game.replay());

// --- Your games and rating -------------------------------------------------------------

const statsDialog = $<HTMLDialogElement>("stats");
const showStats = () => {
  renderStats({
    rating: $("statsRating"),
    summary: $("statsSummary"),
    trend: document.getElementById("statsTrend") as unknown as SVGSVGElement,
    vs: $<HTMLTableElement>("statsVs"),
    games: $<HTMLOListElement>("statsGames"),
  }, loadGames());
  if (!statsDialog.open) statsDialog.showModal();
};
$("openStats").addEventListener("click", showStats);
/** Hands the player a file to save. */
function download(text: string, type: string, extension: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `mancala-games-${new Date().toISOString().slice(0, 10)}.${extension}`,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("exportHistory").addEventListener("click", () => download(exportGames(), "application/json", "json"));
$("exportMgn").addEventListener("click", () => download(gamesToMgn(loadGames()), "text/plain", "mgn"));
$("loadCopy").addEventListener("click", () => $("importHistory").click());
$<HTMLInputElement>("importHistory").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const added = importGames(await file.text());
    showStats();
    $("statsSummary").textContent = `Loaded ${added} ${added === 1 ? "game" : "games"} from the copy. ` +
      $("statsSummary").textContent;
  } catch {
    alert("That file isn't a Mancala backup.");
  }
});
$("clearHistory").addEventListener("click", () => {
  if (confirm("Clear every saved game, and start your rating again at 1000?")) {
    clearGames();
    showStats();
  }
});
// After a rated game, add the rating change to the result line.
game.onGameSaved = (saved) => {
  if (!saved.rated) return;
  const games = loadGames();
  const s = playerStats(games);
  const delta = s.change.get(games.length - 1) ?? 0;
  const toast = $("toast");
  toast.textContent = `${toast.textContent} Your rating: ${s.rating} (${delta >= 0 ? "+" : "−"}${
    Math.abs(Math.round(delta))
  }).`;
};

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector("dialog[open]")) return;
  if ((e.target as HTMLElement).closest("input, select, textarea, [role=listbox]")) return;
  const key = e.key.toLowerCase();
  if (/^[1-7]$/.test(key)) game.playKey(Number(key));
  else if (key === "n") game.start();
  else if (key === "u") game.undo();
  else if (key === "h") void game.hint();
  else if (key === "s") game.skipAhead();
  else if (key === "?") showRules();
  else return;
  e.preventDefault();
});

// Ask the browser not to clear saved games when it's short of space (Chrome and Firefox honour it).
void navigator.storage?.persist?.().catch(() => {});

// Audio can only start after a click or key press, so wake it on the first one.
for (const type of ["pointerdown", "keydown"]) {
  document.addEventListener(type, () => setSound(settings.sound), { once: true });
}

showSettings(settings);
game.start();

// Show the rules once, on a first visit.
try {
  if (!localStorage.getItem("mancala.seenRules")) {
    showRules();
    localStorage.setItem("mancala.seenRules", "1");
  }
} catch { /* storage unavailable: skip it */ }
