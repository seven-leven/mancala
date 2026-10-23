/**
 * docs/images/bot-families: every bot by how it decides (rows) and what it judges positions by
 * (columns), with the gaps worth trying, and the new directions beyond the grid. Elo from the
 * README's table; update the entries here when the ladder changes.
 */
import { BASE_CSS, type Diagram, page, rect, text } from "./svg.ts";

type Entry =
  | { kind: "bot"; name: string; elo: string }
  | { kind: "gap"; lines: string[]; free: boolean }
  | { kind: "none" };
const bot = (name: string, elo: string): Entry => ({ kind: "bot", name, elo });
/** A gap worth trying; `free`: the cheapest or most promising. */
const gap = (...lines: string[]): Entry => ({ kind: "gap", lines, free: false });
const hot = (...lines: string[]): Entry => ({ kind: "gap", lines, free: true });
const NONE: Entry = { kind: "none" };

const COLS = [
  ["NOTHING", "no judgement at all"],
  ["A HAND-WRITTEN SCORE", "rules and evaluate()"],
  ["A LEARNED NET", "trained on games"],
  ["A DECOMPILED FORMULA", "the net's logic, written out"],
  ["RANDOM PLAYOUTS", "games played to the end"],
];
const ROWS: [string, string, Entry[][]][] = [
  ["No look-ahead", "picks from the board as it is", [
    [bot("Random", "1000"), bot("First", "dormant")],
    [NONE],
    [bot("Intuition", "~1200")],
    [gap("Rule tree", "Intuition's choices", "as a decision tree")],
    [NONE],
  ]],
  ["One move ahead", "scores each move's result", [
    [NONE],
    [
      bot("Greedy", "1324"),
      bot("Turtle", "1285"),
      bot("Striker", "1163"),
      bot("Hoarder", "909"),
      bot("Generous", "567"),
    ],
    [gap("Net greedy", "one move, judged by", "the value net")],
    [bot("Rule list", "~1680")],
    [NONE],
  ]],
  ["Chains of free turns", "its chains, then yours", [
    [NONE],
    [bot("DFS v2", "2041"), bot("DFS", "2007"), bot("Chainer", "1492")],
    [bot("Learned DFS", "2058")],
    [hot("Decompiled DFS", "its weights are written:", "one registry entry")],
    [NONE],
  ]],
  ["Fixed-depth search", "every line, a set depth", [
    [NONE],
    [
      bot("Minimax", "2068"),
      bot("Shrewd", "1925"),
      bot("Lookahead", "1742"),
      bot("Planner", "1670"),
      bot("Spoiler", "1468"),
      bot("Grandmaster", "dormant"),
      bot("+ quiescence", "tried"),
    ],
    [gap("Net minimax", "Minimax's search,", "the net at the leaves")],
    [gap("Formula minimax", "Minimax's search,", "the formula at the leaves")],
    [NONE],
  ]],
  ["Search to lose", "aims for the worst result", [
    [NONE],
    [bot("Pushover", "489")],
    [bot("Learned pushover", "456")],
    [bot("Decompiled pushover", "480")],
    [gap("Monte Carlo to lose", "playouts counted", "as losses won")],
  ]],
  ["Sampling a game tree", "tries the promising lines more", [
    [NONE],
    [gap("Smart playouts", "MCTS with Greedy", "playing the games out")],
    [hot("Net-guided MCTS", "AlphaZero-lite: the net", "steers and scores the tree")],
    [NONE],
    [bot("Monte Carlo", "1857")],
  ]],
  ["Mixes", "another bot, some of the time", [
    [NONE],
    [
      bot("Sometimes planner", "1556"),
      bot("Sometimes greedy", "1185"),
      bot("Fickle", "804"),
      bot("Sometimes generous", "731"),
      hot("Strength dial", "softmax over Minimax: one", "bot, any Elo you set"),
    ],
    [NONE],
    [NONE],
    [NONE],
  ]],
];
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
    COLS.forEach(([head, sub], k) =>
      o.push(text(x0 + k * CW + 10, y + 20, head, "label"), text(x0 + k * CW + 10, y + 36, sub, "muted small"))
    );
    y += 52;
    for (const [name, sub, cells] of ROWS) {
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
