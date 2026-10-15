/** Starts the game and wires the page: menus, settings, the rules dialog and the keyboard. */
import { type BotId, BOTS, isBotId, type Seat } from "./bots/bots.ts";
import { Game } from "./app/game.ts";
import { applyTheme, loadSettings, saveSettings, type Settings } from "./app/settings.ts";
import { BoardView } from "./ui/board.ts";

declare const __VERSION__: string;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} is missing from index.html`);
  return el as T;
};

const settings = loadSettings();
applyTheme(settings.theme);

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
}, settings);

// --- Menus -----------------------------------------------------------------------------

const bots = Object.entries(BOTS) as [BotId, (typeof BOTS)[BotId]][];
const option = (value: string, label: string) =>
  Object.assign(document.createElement("option"), { value, textContent: label });

/** The quick opponent menu sets Player 2. */
const opponent = $<HTMLSelectElement>("opponent");
opponent.append(
  ...bots.map(([id, b]) => option(id, `${b.label} · ${b.level}`)),
  option("human", "A friend, same screen"),
);

const form = $<HTMLFormElement>("settingsForm");
for (const name of ["p1", "p2"]) {
  const select = form.elements.namedItem(name) as HTMLSelectElement;
  select.append(option("human", "A person"), ...bots.map(([id, b]) => option(id, `${b.label} · ${b.level}`)));
}
$("seedOptions").innerHTML = [3, 4, 5, 6, 7]
  .map((n) => `<label><input type="radio" name="seeds" value="${n}"><span>${n}</span></label>`)
  .join("");

function showSettings(s: Settings): void {
  opponent.value = s.seats[2];
  const field = (name: string) => form.elements.namedItem(name) as RadioNodeList | HTMLSelectElement;
  (field("p1") as HTMLSelectElement).value = s.seats[1];
  (field("p2") as HTMLSelectElement).value = s.seats[2];
  (field("speed") as RadioNodeList).value = s.speed;
  (field("theme") as RadioNodeList).value = s.theme;
  (field("first") as RadioNodeList).value = s.first;
  (field("seeds") as RadioNodeList).value = String(s.rules.seeds);
  (field("capture") as RadioNodeList).value = s.rules.capture;
  (form.elements.namedItem("clinch") as HTMLInputElement).checked = s.rules.clinch;
  describeRules(s);
}

/** The footer and the rules dialog follow the house rules. */
function describeRules(s: Settings): void {
  const { seeds, capture, clinch } = s.rules;
  $("rulesSummary").textContent = `${seeds} seeds a pit · capture from ${
    capture === "own" ? "your own side" : "either side"
  } · ${clinch ? "ends on a clinched majority" : "played to the last seed"}`;
  $("captureRule").innerHTML = `<strong>Capture:</strong> if the last seed lands in an empty pit ${
    capture === "own" ? "on your side" : "on either side"
  }, bank everything in the pit opposite. The seed that landed stays put.`;
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

opponent.addEventListener("change", () => {
  const v = opponent.value;
  setSeat(2, v === "human" || isBotId(v) ? v : "minimax");
});

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
  settings.theme = (data.get("theme") as Settings["theme"]) ?? settings.theme;
  settings.first = (data.get("first") as Settings["first"]) ?? settings.first;
  settings.rules = {
    seeds: Number(data.get("seeds")) || settings.rules.seeds,
    capture: data.get("capture") === "any" ? "any" : "own",
    clinch: data.get("clinch") === "on",
  };
  saveSettings(settings);
  applyTheme(settings.theme);
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

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector("dialog[open]")) return;
  if ((e.target as HTMLElement).closest("input, select, textarea")) return;
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

$("version").textContent = `v${__VERSION__}`;
showSettings(settings);
game.start();

// Show the rules once, on a first visit.
try {
  if (!localStorage.getItem("mancala.seenRules")) {
    showRules();
    localStorage.setItem("mancala.seenRules", "1");
  }
} catch { /* storage unavailable: skip it */ }
