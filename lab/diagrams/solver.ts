/** docs/images/solver: how lab/solve/ solves a board of n pits and s seeds, from the board to the grid. */
import { arrow, BASE_CSS, box, type Diagram, MARKERS, page, rect, text } from "./svg.ts";

const CSS = `${BASE_CSS}
  .monoink { font: 11px "IBM Plex Mono", ui-monospace, Consolas, monospace; }
  .pit { fill: var(--surface); stroke: var(--muted); stroke-width: 1.2; }
  .path { stroke: var(--accent); stroke-width: 1.5; fill: none; stroke-dasharray: 5 4; marker-end: url(#ak); }
  .cell { fill: var(--surface); stroke: var(--strong); }`;

const mono = (line: string) => /^(search\(|lo |g |key|data\/|lab\/|node |npm )/.test(line);

export const solver: Diagram = {
  name: "solver",
  png: true,
  draw(theme) {
    const o: string[] = [MARKERS];
    const b = (x: number, y: number, w: number, h: number, lines: string[], cls = "box") =>
      o.push(...box(x, y, w, h, lines, cls, mono));
    o.push(text(24, 50, "The solver: any board, played perfectly", "title"));
    o.push(
      text(
        24,
        74,
        "lab/solve/: n pits a side, s seeds in each, the game's own rules. The answer: the first player's final margin with best play by both.",
        "muted small",
      ),
    );

    // 1. The board.
    const y0 = 104;
    o.push(text(24, y0, "1  THE BOARD, FOR ANY n (HERE n = 5)", "label"), rect(24, y0 + 12, 712, 150, "tint"));
    const px = 110, pw = 46, gap = 10, top = y0 + 36, bot = y0 + 96;
    for (let i = 0; i < 5; i++) {
      const x = px + i * (pw + gap);
      o.push(rect(x, bot, pw, 40, "pit", 10), text(x + pw / 2, bot + 25, String(i), "monoink", "middle"));
      o.push(rect(x, top, pw, 40, "pit", 10), text(x + pw / 2, top + 25, String(5 + i), "monoink", "middle"));
    }
    const sx2 = px - 62, sx1 = px + 5 * (pw + gap) + 6, right = px + 5 * (pw + gap) - gap;
    for (const [sx, label] of [[sx2, "11"], [sx1, "10"]] as const) {
      o.push(rect(sx, top, 56, 100, "pit", 14), text(sx + 28, top + 55, label, "monoink", "middle"));
    }
    // The sowing path, from the first player's side.
    o.push(
      `  <path class="path" d="M ${px + 10} ${bot + 48} L ${right - 4} ${bot + 48} Q ${sx1 + 28} ${bot + 48} ${
        sx1 + 28
      } ${bot + 40}" />`,
      `  <path class="path" d="M ${sx1 + 28} ${top - 6} Q ${sx1 + 28} ${top - 12} ${right - 4} ${top - 12} L ${
        px + 10
      } ${top - 12}" />`,
    );
    const notes: [string, string][] = [
      ["Pits 0..n−1: the first player's. Their store: 2n.", "small"],
      ["Pits n..2n−1: the second's. Their store: 2n+1.", "small"],
      ["Seeds travel 0 → n−1, store, 2n−1 → n,", "muted small"],
      ["skipping the opponent's store. Pit i faces i+n.", "muted small"],
      ["play(): relay sowing, free turns, captures,", "muted small"],
      ["the early finish at a majority. At n = 7 it is", "muted small"],
      ["the game's engine, seed for seed (tested).", "muted small"],
    ];
    notes.forEach(([s, cls], k) => o.push(text(486, y0 + [40, 56, 76, 92, 112, 128, 144][k], s, cls)));

    // 2. One board's solve.
    const y1 = y0 + 196;
    o.push(text(24, y1, "2  ONE BOARD: MTD(f), A FEW ZERO-WINDOW SEARCHES", "label"));
    b(24, y1 + 14, 200, 92, [
      "Start",
      "newBoard(n, s): s seeds in",
      "each pit, stores empty, the",
      "first player to move.",
    ]);
    b(268, y1 + 14, 224, 92, [
      "Ask one yes/no question",
      "g = 1 first: does the first",
      "player win at all? Then the",
      "next guess between lo and hi.",
    ], "box key");
    b(536, y1 + 14, 200, 92, [
      "Narrow the bounds",
      "lo ≤ margin ≤ hi, starting",
      "at ±all the seeds; each",
      "answer moves one of them.",
    ]);
    o.push(arrow(224, y1 + 60, 266, y1 + 60), arrow(492, y1 + 46, 534, y1 + 46, "arrow key"));
    o.push(arrow(536, y1 + 80, 494, y1 + 80), text(514, y1 + 132, "repeat until lo = hi", "muted small", "middle"));
    b(24, y1 + 152, 344, 76, [
      "Out of budget",
      "Stops after its budget of positions (200M a board) and",
      "keeps what's proved: lo > 0 still means a forced win.",
    ]);
    b(392, y1 + 152, 344, 76, [
      "Solved (lo = hi)",
      "The exact margin, and the opening that keeps it: each",
      'first move asked "does this one reach lo?"',
    ]);
    o.push(arrow(330, y1 + 106, 220, y1 + 150), arrow(636, y1 + 106, 600, y1 + 150));

    // 3. Inside one search.
    const y2 = y1 + 262;
    o.push(text(24, y2, "3  INSIDE THE SEARCH: FAIL-SOFT ALPHA-BETA, EVERY POSITION REMEMBERED", "label"));
    const steps = [
      ["Look it up", "The position's key:", "its bounds and its", "best move last time."],
      ["Settled?", "The memo's bounds,", "and the stores'; or a", "child's bounds already", "beat beta: return."],
      ["Order moves", "Game-enders, free", "turns (a chain that", "clinches is a proof),", "memo's best, banked."],
      ["Recurse", "Same side after a", "free turn, else the", "opponent's, negated.", "Stop at beta."],
      ["Remember", "The new bound", "(upper if it failed", "low, lower if high)", "and the best move."],
    ];
    steps.forEach((lines, k) => {
      const x = 24 + k * 145;
      b(x, y2 + 14, 132, 112, lines, k === 2 ? "box key" : "box");
      if (k < steps.length - 1) o.push(arrow(x + 132, y2 + 70, x + 143, y2 + 70));
    });
    o.push(
      text(
        24,
        y2 + 150,
        "Stores never lose seeds, so the mover's margin is at least 2·(their store) − all, at most all − 2·(the opponent's): ten times fewer positions.",
        "muted small",
      ),
      text(
        24,
        y2 + 182,
        "Why remembering everything is safe: seeds only move towards their side's store or into a store, so no position comes round twice;",
        "muted small",
      ),
      text(24, y2 + 198, "a position's value doesn't depend on how it was reached.", "muted small"),
    );

    // 4. The memo.
    const y3 = y2 + 232;
    o.push(text(24, y3, "4  THE MEMO: 8 BYTES A POSITION, A FIXED SIZE, SHARED BY THE WORKERS", "label"));
    const words = [
      ["check", "the key's high half XOR the value: a torn write fails it"],
      ["value", "lo, hi, best move and work, packed in 32 bits"],
    ];
    words.forEach(([name, what], k) => {
      const x = 24 + 356 * k;
      o.push(rect(x, y3 + 14, 356, 58, "cell", 6), text(x + 12, y3 + 36, `${name} · 4 bytes`, "h"));
      o.push(text(x + 12, y3 + 56, what, "muted small"));
    });
    o.push(
      text(
        24,
        y3 + 94,
        "Buckets of two, picked by the key's low half (64-bit Zobrist keys, updated seed by seed as moves are played). When",
        "muted small",
      ),
      text(
        24,
        y3 + 110,
        "both are full, a new entry replaces the one whose search did less work, so memory never grows (2^25 entries: 256 MB).",
        "muted small",
      ),
      text(
        24,
        y3 + 126,
        "A board left unsolved can save its memo to disk, and the next run carries on from it.",
        "muted small",
      ),
    );

    // 5. The grid.
    const y4 = y3 + 160;
    o.push(text(24, y4, "5  THE GRID: 100 BOARDS, LIGHT ON THE MACHINE", "label"));
    b(24, y4 + 14, 160, 92, ["Queue", "1–10 pits × 1–10", "seeds, smallest", "boards first."]);
    b(214, y4 + 14, 170, 92, ["Workers", "4 at low priority, all", "on one board (lazy", "SMP), one memo."], "box key");
    b(414, y4 + 14, 150, 92, ["lab/results/", "solved-boards.json,", "saved as each board", "finishes; resumable."]);
    b(594, y4 + 14, 142, 92, ["The heat map", "docs/images/", "solved-boards.svg"]);
    o.push(arrow(184, y4 + 60, 212, y4 + 60), arrow(384, y4 + 60, 412, y4 + 60, "arrow key"));
    o.push(arrow(564, y4 + 60, 592, y4 + 60));
    o.push(
      text(
        24,
        y4 + 132,
        "npm run solve -- [--budget] [--workers] [--bits] [--boards 10x2] [--save]   ·   tests/solver_test.ts: the engine",
        "mono",
      ),
      text(
        24,
        y4 + 148,
        "seed for seed at 7 pits; plain minimax on small boards; a memo of 64 entries still exact; workers agree with one core.",
        "mono",
      ),
    );
    return page({
      width: 760,
      height: 1178,
      theme,
      css: CSS,
      body: o,
      title: "The solver: any board, played perfectly",
      desc: "How the small-board solver works. 1: the board for any n, pits 0 to n−1 and store 2n for the first " +
        "player, pits n to 2n−1 and store 2n+1 for the second, seeds travelling counter-clockwise past the " +
        "opponent's store. 2: MTD(f) asks zero-window yes/no questions, first whether the first player wins, " +
        "narrowing bounds on the margin until they meet or the budget runs out. 3: each search node looks the " +
        "position up in the memo, returns if settled, orders moves (game-ending, free turns, the remembered best, " +
        "most banked), recurses, and remembers the new bound. 4: the memo stores a check word and a packed value, " +
        "8 bytes a position, in a fixed table that replaces its cheapest entries. 5: the grid of 100 boards runs " +
        "one board at a time on four low-priority workers sharing the memo, saved to " +
        "lab/results/solved-boards.json and drawn as a heat map.",
    });
  },
};
