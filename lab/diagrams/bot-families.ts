/**
 * docs/images/bot-families: every bot by how it decides (rows) and what it judges positions by
 * (columns), from the registry's `decides` and `judges` (src/bots/bots.ts) and the ratings; with
 * the gaps worth trying, written here, and the new directions beyond the grid.
 */
import { BOTS, DORMANT } from "../../src/bots/bots.ts";
import type { BotSpec, Decides, Judges } from "../../src/bots/contracts.ts";
import { RATINGS } from "../../src/bots/ratings.ts";
import { BASE_CSS, type Diagram, page, rect, text } from "./svg.ts";

type Entry =
  | { kind: "bot"; name: string; elo: string }
  | { kind: "gap"; lines: string[]; free: boolean }
  | { kind: "none" };
/** A gap worth trying; `free`: the cheapest or most promising. */
const gap = (...lines: string[]): Entry => ({ kind: "gap", lines, free: false });
const hot = (...lines: string[]): Entry => ({ kind: "gap", lines, free: true });

const COLS: [Judges, string, string][] = [
  ["nothing", "NOTHING", "no judgement at all"],
  ["rules", "A HAND-WRITTEN SCORE", "rules and evaluate()"],
  ["net", "A LEARNED NET", "trained on games"],
  ["formula", "A DECOMPILED FORMULA", "the net's logic, written out"],
  ["playouts", "RANDOM PLAYOUTS", "games played to the end"],
];
const ROWS: [Decides, string, string][] = [
  ["nothing", "No look-ahead", "picks from the board as it is"],
  ["one-move", "One move ahead", "scores each move's result"],
  ["chain", "Chains of free turns", "its chains, then yours"],
  ["search", "Fixed-depth search", "every line, a set depth"],
  ["lose", "Search to lose", "aims for the worst result"],
  ["sampling", "Sampling a game tree", "tries the promising lines more"],
  ["mix", "Mixes", "another bot, some of the time"],
];
/** What isn't a bot: ideas tried and dropped, and gaps worth trying, by row and column. */
const EXTRA: Partial<Record<`${Decides}/${Judges}`, Entry[]>> = {
  "nothing/formula": [gap("Rule tree", "Intuition's choices", "as a decision tree")],
  "one-move/net": [gap("Net greedy", "one move, judged by", "the value net")],
  "chain/formula": [hot("Decompiled DFS", "its weights are written:", "one registry entry")],
  "search/rules": [{ kind: "bot", name: "+ quiescence", elo: "tried" }],
  "search/net": [gap("Net minimax", "Minimax's search,", "the net at the leaves")],
  "search/formula": [gap("Formula minimax", "Minimax's search,", "the formula at the leaves")],
  "lose/playouts": [gap("Monte Carlo to lose", "playouts counted", "as losses won")],
  "sampling/rules": [gap("Smart playouts", "MCTS with Greedy", "playing the games out")],
  "sampling/net": [hot("Net-guided MCTS", "AlphaZero-lite: the net", "steers and scores the tree")],
  "mix/rules": [hot("Strength dial", "softmax over Minimax: one", "bot, any Elo you set")],
};

/** A cell's entries: its rated bots strongest first, then its dormant ones, then the extras. */
function cell(d: Decides, j: Judges): Entry[] {
  const rated = (Object.entries(BOTS) as [keyof typeof BOTS, BotSpec][])
    .filter(([, b]) => b.decides === d && b.judges === j)
    .sort(([a], [b]) => RATINGS[b].elo - RATINGS[a].elo)
    .map(([id, b]): Entry => ({ kind: "bot", name: b.label, elo: String(RATINGS[id].elo) }));
  const dormant = Object.values(DORMANT)
    .filter((b) => b.decides === d && b.judges === j)
    .map((b): Entry => ({ kind: "bot", name: b.label, elo: b.status }));
  const all = [...rated, ...dormant, ...(EXTRA[`${d}/${j}`] ?? [])];
  return all.length ? all : [{ kind: "none" }];
}

const CARDS: [string, string[]][] = [
  ["Learning without a teacher", [
    "Self-play / TD learning: the only",
    "way past Minimax's own labels",
    "Evolved weights for evaluate()",
    "Plays like you: trained on your games",
  ]],
  ["Exact play", [
    "Endgame tablebase: solve every",
    "position with few seeds left",
    "Opening book (pit 1 wins by force)",
    "Proof-number search",
  ]],
  ["Strength for people", [
    "Rubber band: keeps the game close",
    "Sandbagger: weak until it's behind",
    "Teacher: points out your mistakes",
    "Fills the gaps at 567–731, 1324–1468",
  ]],
  ["Reading the opponent", [
    "Exploiter: works out which bot it",
    "faces, and plays to its weaknesses",
    "Mirror: copies your pit",
    "Ensemble: a vote of several bots",
  ]],
  ["Style", [
    "Showoff: the longest chains",
    "Capture hunter",
    "Draw-seeker: the closest result",
    "Longest or shortest game",
  ]],
  ["Rule variants", [
    "Every bot is tuned for 7 seeds",
    "Bots for the house rules (3–15",
    "seeds, captures either side)",
    "And for the pie rule (#17)",
  ]],
  ["Novelty", ["An LLM bot: Claude plays", "through the API", "Slow and needs a key,", "but a fun rung to rate"]],
];

const CSS = `${BASE_CSS}
  .mono { font: 11px "IBM Plex Mono", ui-monospace, Consolas, monospace; fill: var(--muted); }
  .gaptext { font-size: 11px; fill: var(--accent); }
  .gaptext.b { font-weight: 600; }
  .cell { fill: var(--surface); stroke: var(--rule); stroke-width: 1; }
  .head { fill: var(--tint); }
  .gap { fill: none; stroke: var(--accent); stroke-width: 1.2; stroke-dasharray: 4 3; }
  .gap.free { fill: var(--tint); stroke-dasharray: none; }
  .card { fill: var(--surface); stroke: var(--strong); stroke-width: 1; }`;

const entryHeight = (e: Entry) => (e.kind === "gap" ? 20 + 15 * e.lines.length : 18);

export const botFamilies: Diagram = {
  name: "bot-families",
  png: true,
  draw(theme) {
    const M = 24, LW = 168, CW = 172, PAD = 10, W = M * 2 + LW + CW * COLS.length;
    const o: string[] = [];
    let y = M + 28;
    o.push(
      text(M, y, "The bots, by family", "title"),
      text(
        M,
        y + 22,
        "Rows: how a bot decides. Columns: what it judges positions by. Elo from the 240-game rating, Random pinned at 1000.",
        "muted small",
      ),
      text(
        M,
        y + 38,
        "Dashed: a gap worth trying. Filled: the gaps that are cheapest (Decompiled DFS, the strength dial) or most promising (net-guided MCTS).",
        "muted small",
      ),
    );
    y += 62;
    // Column heads.
    const x0 = M + LW;
    o.push(rect(M, y, W - 2 * M, 46, "head", 6), text(M + 12, y + 20, "DECIDES BY ↓", "label"));
    o.push(text(M + 12, y + 36, "JUDGED BY →", "label"));
    COLS.forEach(([, head, sub], k) =>
      o.push(text(x0 + k * CW + 10, y + 20, head, "label"), text(x0 + k * CW + 10, y + 36, sub, "muted small"))
    );
    y += 52;
    for (const [d, name, sub] of ROWS) {
      const cells = COLS.map(([j]) => cell(d, j));
      const h = Math.max(Math.max(...cells.map((c) => c.reduce((a, e) => a + entryHeight(e), 0))) + 2 * PAD, 52);
      o.push(text(M + 12, y + PAD + 13, name, "h"), text(M + 12, y + PAD + 30, sub, "muted small"));
      cells.forEach((cell, k) => {
        const cx = x0 + k * CW;
        o.push(rect(cx + 2, y, CW - 4, h, "cell", 6));
        let cy = y + PAD;
        for (const e of cell) {
          if (e.kind === "bot") {
            o.push(text(cx + 12, cy + 13, e.name), text(cx + CW - 12, cy + 13, e.elo, "mono", "end"));
          } else if (e.kind === "none") {
            o.push(text(cx + CW / 2, y + h / 2 + 4, "—", "muted", "middle"));
          } else {
            o.push(rect(cx + 8, cy + 2, CW - 16, 14 + 15 * e.lines.length, e.free ? "gap free" : "gap", 5));
            e.lines.forEach((line, j) =>
              o.push(text(cx + 16, cy + 18 + 15 * j, line, j === 0 ? "gaptext b" : "gaptext"))
            );
          }
          cy += entryHeight(e);
        }
      });
      y += h + 6;
    }
    // Beyond the grid.
    y += 18;
    o.push(text(M, y, "BEYOND THE GRID: NEW AXES NOBODY HAS TRIED YET", "label"));
    y += 12;
    const GAP = 12, PER = 4, cw = (W - 2 * M - GAP * (PER - 1)) / PER, ch = 112;
    const slot = (k: number) => [M + (k % PER) * (cw + GAP), y + Math.floor(k / PER) * (ch + GAP)];
    CARDS.forEach(([head, lines], k) => {
      const [cx, cy] = slot(k);
      o.push(rect(cx, cy, cw, ch, "card"), text(cx + 14, cy + 24, head, "h"));
      lines.forEach((line, j) => o.push(text(cx + 14, cy + 46 + 16 * j, line, "muted small")));
    });
    // The last slot: the ceiling.
    const [cx, cy] = slot(CARDS.length);
    o.push(text(cx + 4, cy + 24, "A ceiling to remember", "h"));
    [
      "From these openings the seat decides",
      "the game: nothing beats Minimax, only",
      "ties it. New bots win on speed, on",
      "filling rungs, or on style.",
    ].forEach((line, j) => o.push(text(cx + 4, cy + 46 + 16 * j, line, "muted small")));
    return page({
      width: W,
      height: Math.round(y + 2 * ch + GAP + M),
      theme,
      css: CSS,
      body: o,
      title: "The bots, by family, and the gaps between them",
      desc: "A grid of the bots: rows are how a bot decides (no look-ahead, one move ahead, chains of free turns, " +
        "fixed-depth search, search to lose, sampling a game tree, mixes) and columns are what it judges positions " +
        "by (nothing, a hand-written score, a learned net, a decompiled formula, random playouts). Each filled cell " +
        "lists its bots with their Elo; dashed cells are untried combinations such as Net minimax, Decompiled DFS, " +
        "net-guided MCTS and a strength dial. Below, new axes: learning without a teacher, exact play, strength for " +
        "people, reading the opponent, style, rule variants and an LLM bot.",
    });
  },
};
