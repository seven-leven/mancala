/**
 * docs/images/solved-boards: who wins with best play on every board from 1 to 10 pits a side and
 * 1 to 10 seeds a pit, from lab/results/solved-boards.json (lab/solve/grid.ts writes it).
 */
import { readFileSync } from "node:fs";
import type { Cell } from "../solve/grid.ts";
import { BASE_CSS, type Diagram, page, rect, text, type Theme } from "./svg.ts";

const RESULTS = new URL("../results/solved-boards.json", import.meta.url);

/** +1 the first player wins by force, -1 the second, 0 a draw, null not proved. */
function outcome(c: Cell | undefined): number | null {
  if (!c) return null;
  if (c.lo > 0) return 1;
  if (c.hi < 0) return -1;
  return c.lo === 0 && c.hi === 0 ? 0 : null;
}

const WHO = new Map<number | null, string>([[1, "1st wins"], [-1, "2nd wins"], [0, "draw"]]);

// Diverging colours for the first player's share of the seeds, 50% in the middle.
const FIRST = [168, 72, 63], SECOND = [52, 98, 140];
const mix = (a: number[], b: number[], t: number) =>
  "#" + a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, "0")).join("");
function colour(share: number, theme: Theme): string {
  const paper = theme === "dark" ? [40, 38, 36] : [246, 244, 239];
  const d = Math.max(-1, Math.min(1, (share - 0.5) / 0.5));
  return d >= 0 ? mix(paper, FIRST, d ** 0.7) : mix(paper, SECOND, (-d) ** 0.7);
}

const CSS = `${BASE_CSS}
  .tick { font: 12px "IBM Plex Mono", ui-monospace, Consolas, monospace; fill: var(--muted); }
  .pct { font-size: 13px; font-weight: 600; }
  .sub { font: 10px "IBM Plex Mono", ui-monospace, Consolas, monospace; }
  .light { fill: #fffdf9; }
  .edge { stroke: var(--ink); stroke-width: 2.5; stroke-linecap: round; }
  .std { fill: none; stroke: var(--ink); stroke-width: 2; stroke-dasharray: 4 3; }
  .hatch { stroke: var(--strong); stroke-width: 1; }
  .frame { fill: none; stroke: var(--rule); }`;

export const solvedBoards: Diagram = {
  name: "solved-boards",
  png: true,
  draw(theme) {
    const cells = new Map<string, Cell>();
    for (const c of JSON.parse(readFileSync(RESULTS, "utf8")) as Cell[]) cells.set(`${c.pits}x${c.seeds}`, c);
    const at = (p: number, s: number) => cells.get(`${p}x${s}`);
    const M = 28, CS = 64, LEFT = M + 64, TOP = M + 96;
    const W = LEFT + 10 * CS + 230, H = TOP + 10 * CS + 120;
    const cx = (p: number) => LEFT + (p - 1) * CS, cy = (s: number) => TOP + (10 - s) * CS; // more seeds higher up
    const o: string[] = [
      text(M, M + 26, "Who wins with best play, by board size", "title"),
      text(
        M,
        M + 50,
        "Each square: the first player's share of all the seeds when both sides play perfectly. Hatched: too big to solve exactly in",
        "muted small",
      ),
      text(
        M,
        M + 66,
        "the budget, so the range it was narrowed to and, where proved, who wins. Standard rules otherwise. Thick lines: the winner changes.",
        "muted small",
      ),
      '  <defs><pattern id="h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<line class="hatch" x1="0" y1="0" x2="0" y2="6" /></pattern></defs>',
    ];
    for (let p = 1; p <= 10; p++) {
      for (let s = 1; s <= 10; s++) {
        const c = at(p, s), x = cx(p), y = cy(s);
        if (!c) {
          o.push(rect(x, y, CS, CS, "", 0, ' fill="url(#h)"'));
          continue;
        }
        const total = 2 * p * s, share = (m: number) => (total + m) / 2 / total;
        const mid = (c.lo + c.hi) / 2, solved = c.lo === c.hi;
        o.push(`  <rect x="${x}" y="${y}" width="${CS}" height="${CS}" fill="${colour(share(mid), theme)}" />`);
        if (!solved) o.push(`  <rect x="${x}" y="${y}" width="${CS}" height="${CS}" fill="url(#h)" opacity="0.8" />`);
        const cls = Math.abs(share(mid) - 0.5) > 0.3 ? "light" : "";
        if (solved) {
          o.push(text(x + CS / 2, y + CS / 2 + 1, `${Math.round(100 * share(c.lo))}%`, `pct ${cls}`.trim(), "middle"));
          o.push(text(x + CS / 2, y + CS / 2 + 16, `${c.lo > 0 ? "+" : ""}${c.lo}`, `sub ${cls || "muted"}`, "middle"));
          continue;
        }
        const who = WHO.get(outcome(c)) ?? "unknown";
        if (c.lo === -total && c.hi === total) {
          // Nothing proved: no range to show.
          o.push(text(x + CS / 2, y + CS / 2 + 4, who, "sub muted", "middle"));
        } else {
          const range = `${Math.round(100 * share(c.lo))}–${Math.round(100 * share(c.hi))}%`;
          o.push(text(x + CS / 2, y + CS / 2 - 1, range, `sub ${cls}`.trim(), "middle"));
          o.push(text(x + CS / 2, y + CS / 2 + 13, who, `sub ${cls || "muted"}`, "middle"));
        }
      }
    }
    // Thick edges where the proved winner changes.
    for (let p = 1; p <= 10; p++) {
      for (let s = 1; s <= 10; s++) {
        const a = outcome(at(p, s));
        const right = p < 10 ? outcome(at(p + 1, s)) : null, up = s < 10 ? outcome(at(p, s + 1)) : null;
        if (a !== null && right !== null && a !== right) {
          o.push(`  <line class="edge" x1="${cx(p + 1)}" y1="${cy(s)}" x2="${cx(p + 1)}" y2="${cy(s) + CS}" />`);
        }
        if (a !== null && up !== null && a !== up) {
          const y = cy(s + 1) + CS;
          o.push(`  <line class="edge" x1="${cx(p)}" y1="${y}" x2="${cx(p) + CS}" y2="${y}" />`);
        }
      }
    }
    o.push(rect(LEFT, TOP, 10 * CS, 10 * CS, "frame", 0));
    o.push(rect(cx(7) + 2, cy(7) + 2, CS - 4, CS - 4, "std", 0));
    // Axes.
    for (let p = 1; p <= 10; p++) o.push(text(cx(p) + CS / 2, TOP + 10 * CS + 20, String(p), "tick", "middle"));
    for (let s = 1; s <= 10; s++) o.push(text(LEFT - 12, cy(s) + CS / 2 + 4, String(s), "tick", "end"));
    o.push(text(LEFT + 5 * CS, TOP + 10 * CS + 46, "PITS A SIDE (BETWEEN THE TWO STORES)", "label", "middle"));
    o.push(
      `  <text class="label" transform="translate(${M + 12} ${
        TOP + 5 * CS
      }) rotate(-90)" text-anchor="middle">SEEDS IN EACH PIT AT THE START</text>`,
    );
    // Legend and notes.
    const lx = LEFT + 10 * CS + 32, ly = TOP;
    o.push(text(lx, ly + 4, "FIRST PLAYER'S SHARE", "label"));
    for (let k = 0; k <= 10; k++) {
      const v = 1 - k / 10;
      o.push(`  <rect x="${lx}" y="${ly + 16 + k * 22}" width="28" height="22" fill="${colour(v, theme)}" />`);
      if (k % 2 === 0) o.push(text(lx + 38, ly + 31 + k * 22, `${Math.round(100 * v)}%`, "tick"));
    }
    o.push(
      text(lx, ly + 286, "red: the first player", "small"),
      text(lx, ly + 302, "wins by force", "small"),
      text(lx, ly + 324, "blue: the second player", "small"),
      text(lx, ly + 340, "wins by force", "small"),
      text(lx, ly + 362, "small number: the winning", "muted small"),
      text(lx, ly + 378, "margin in seeds", "muted small"),
      rect(lx, ly + 396, 28, 22, "", 0, ' fill="url(#h)"'),
      text(lx + 38, ly + 411, "too big to solve", "small"),
      text(lx, ly + 434, "exactly: the range proved", "muted small"),
      rect(lx + 2, ly + 450, 24, 18, "std", 0),
      text(lx + 38, ly + 463, "the standard game", "small"),
    );
    const all = [...cells.values()];
    const solved = all.filter((c) => c.lo === c.hi).length, proved = all.filter((c) => outcome(c) !== null).length;
    o.push(
      text(
        M,
        H - 24,
        `${solved} of 100 boards solved exactly, ${proved} with the winner proved, by lab/solve/grid.ts (alpha-beta, every position remembered; checked against the game's own engine).`,
        "muted small",
      ),
    );
    return page({
      width: W,
      height: H,
      theme,
      css: CSS,
      body: o,
      title: "Who wins with best play, by board size",
      desc:
        "A 10 by 10 heat map: pits a side across, seeds per pit up. Each square shows the first player's share of " +
        "the seeds with perfect play by both, red where the first player wins by force and blue where the second " +
        "does; thick lines mark where the winner changes.",
    });
  },
};
