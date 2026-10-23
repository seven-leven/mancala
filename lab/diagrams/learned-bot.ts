/** docs/images/learned-bot: the learned bot (Learned DFS), how it's trained and how it plays. */
import { BASE_CSS, box, type Diagram, MARKERS, page, rect, text } from "./svg.ts";

const CSS = `${BASE_CSS}
  .title { font-size: 22px; }
  .wire { stroke: var(--rule); stroke-width: 0.8; }
  .node { fill: var(--surface); stroke: var(--muted); stroke-width: 1.2; }
  .node.out { fill: var(--accent); stroke: var(--accent); }`;

const mono = (line: string) => /^(npm|data\/|src\/|lab\/|17 |~)/.test(line);

export const learnedBot: Diagram = {
  name: "learned-bot",
  png: true,
  draw(theme) {
    const W = 720, H = 760;
    const o: string[] = [MARKERS];
    o.push(text(24, 36, "A learned bot", "title"));
    o.push(text(696, 36, "built October 2026 · in the menus as Wise", "muted small", "end"));
    const xs = [24, 196, 368, 540], bw = 156;
    const row = (y: number, label: string, boxes: string[][], key: number) => {
      o.push(text(24, y - 12, label, "label"));
      boxes.forEach((lines, k) => {
        o.push(...box(xs[k], y, bw, 78, lines, k === key ? "box key" : "box", mono));
        if (k < 3) {
          o.push(`  <line class="arrow" x1="${xs[k] + bw + 2}" y1="${y + 39}" x2="${xs[k + 1] - 3}" y2="${y + 39}" />`);
        }
      });
    };
    // Training, offline.
    row(92, "TRAINING · OFFLINE, ONCE", [
      ["Varied games", "DFS v2, with some", "random moves mixed in"],
      ["Positions", "lab/learn/data.ts", "200,000 labelled"],
      ["Teacher labels", "Minimax, depth 6,", "for the side to move"],
      ["Train the net", "lab/learn/train.ts", "seeded, a minute"],
    ], 3);
    // The weights, from the training box down.
    o.push(...box(540, 196, bw, 58, ["weights.ts", "561 weights"], "box key", mono));
    o.push('  <line class="arrow key" x1="618" y1="172" x2="618" y2="193" />');
    // Play, every move.
    row(304, "PLAY · IN THE BOT, EVERY MOVE", [
      ["The position", "pits, stores and", "whose turn it is"],
      ["Chain search", "DFS v2: its chains,", "then your best answer"],
      ["Value net", "scores the end of", "each line, in µs"],
      ["The move", "the line whose worst", "answer scores best"],
    ], 2);
    // The weights feed the value net.
    o.push('  <path class="arrow key" d="M618 256 V278 H446 V301" />', text(456, 274, "loaded once", "accent small"));
    o.push(
      text(
        24,
        404,
        "Search handles the tactics (chains, captures); the net handles judgement: it calls the winner right 91% of the time.",
        "muted small",
      ),
    );

    // The network.
    o.push(text(24, 448, "THE VALUE NET", "label"), rect(24, 460, 672, 168, "tint"));
    const cols: [number, number, string, string][] = [
      [110, 9, "16 inputs", "pits and stores, mover's side"],
      [290, 8, "16", "ReLU"],
      [470, 8, "16", "ReLU"],
      [630, 1, "1 output", "value for the side to move"],
    ];
    const ys = (n: number) => (n === 1 ? [544] : Array.from({ length: n }, (_, i) => 482 + i * (124 / (n - 1))));
    const pts = cols.map(([x, n]) => ys(n).map((y) => [x, y]));
    for (let c = 0; c + 1 < pts.length; c++) {
      for (const [x1, y1] of pts[c]) {
        for (const [x2, y2] of pts[c + 1]) {
          o.push(`  <line class="wire" x1="${x1}" y1="${y1.toFixed(1)}" x2="${x2}" y2="${y2.toFixed(1)}" />`);
        }
      }
    }
    cols.forEach(([, n], c) =>
      pts[c].forEach(([px, py], k) => {
        if (n > 1 && k === Math.floor(n / 2)) o.push(text(px, py + 4, "⋮", "muted", "middle"));
        else o.push(`  <circle class="node${n === 1 ? " out" : ""}" cx="${px}" cy="${py.toFixed(1)}" r="6" />`);
      })
    );
    for (const [x, , head, sub] of cols) {
      o.push(text(x, 646, head, "h", "middle"), text(x, 662, sub, "muted small", "middle"));
    }
    o.push(
      text(
        380,
        690,
        "561 weights, plain TypeScript, no library: about half a microsecond a position.",
        "muted small",
        "middle",
      ),
    );

    // Measured, and what's next.
    o.push(
      text(24, 716, "THEN", "label"),
      text(
        74,
        716,
        "Measured: a tie with Minimax (49.5% over 800 games) at about a third of its time, and +17 Elo over DFS v2.",
        "muted small",
      ),
      text(
        74,
        733,
        "Later, self-play under the pie rule (#17), where strong-against-strong games are contestable, to go past the teacher.",
        "muted small",
      ),
    );
    return page({
      width: W,
      height: H,
      theme,
      css: CSS,
      body: o,
      rx: 12,
      title: "The learned bot: how it is trained and how it plays",
      desc: "Training, offline: varied games give 200,000 positions, Minimax labels each one at depth 6, and a small " +
        "value network is trained to match the labels; its 561 weights are committed. Play, every move: from the " +
        "position, DFS v2's chain search follows the bot's own chains and the opponent's best answer, the value " +
        "network scores each position at the end of a line, and the best move is played. The network takes 16 " +
        "numbers (the pits and stores, from the mover's side), has two hidden layers of 16, and gives one value. " +
        "It ties Minimax at about a third of its time, and could improve by self-play under the pie rule.",
    });
  },
};
