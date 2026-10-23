/**
 * docs/images/rating-session and rating-reading, for docs/RATING.md: a rating run step by step,
 * and how to read the ranges it gives.
 */
import { BASE_CSS, type Diagram, page, rect, text } from "./svg.ts";

const CSS = `${BASE_CSS}
  .title { font-size: 20px; }
  .h { font-size: 14px; }
  .small { font-size: 11px; }
  .mono { font: 11.5px "IBM Plex Mono", ui-monospace, Consolas, monospace; fill: var(--ink); }
  .mono.muted { fill: var(--muted); }
  .num { font: 600 13px Inter, system-ui, sans-serif; fill: var(--bg); }
  .rule { stroke: var(--rule); fill: none; }
  .outline { stroke: var(--rule); fill: none; }
  .dot { fill: var(--ink); }
  .dot.close { fill: var(--accent); }
  .bar { stroke: var(--ink); stroke-width: 4; stroke-linecap: round; }
  .bar.close { stroke: var(--accent); }
  .bar.old { stroke: var(--muted); stroke-width: 2; }
  .circle { fill: var(--ink); }
  .curve { stroke: var(--ink); stroke-width: 2; fill: none; }
  .mark { fill: var(--accent); }`;

const STEPS: [string, string, string, [string, string]][] = [
  ["Decide whether to re-rate", "A new or changed bot, or an engine or harness", "change that plays different games.", [
    "git diff main -- src/bots src/game",
    "# does anything play differently?",
  ]],
  ["Place a new bot", "A quick run with Random and a few neighbours;", "tune its knob until it lands in its gap.", [
    "npm run rate -- 40 --bots \\",
    "  random,greedy,turtle,newBot",
  ]],
  [
    "Run the full rating",
    "Every bot in BOTS, 240 games a pairing: about",
    "5 min on 16 cores. Ctrl+C stops; --resume goes on.",
    [
      "npm run rate -- 240 --write --ui \\",
      "  | tee data/ratings-240.md",
    ],
  ],
  [
    "Read it as a ladder",
    "Neighbours whose 90% ranges overlap are too",
    "close to call; a move inside the old range is noise.",
    [
      "Elo · 90% range · Won",
      "and the head-to-head table",
    ],
  ],
  ["Publish", "Redraw the chart, reorder levels if the ladder", "changed, update the README table and CHANGELOG.", [
    "npm run ladder",
    "npm test  # then commit",
  ]],
];

export const ratingSession: Diagram = {
  name: "rating-session",
  png: false,
  draw(theme) {
    const W = 720, top = 64, row = 86, H = top + row * STEPS.length + 12;
    const o = [
      text(24, 34, "A rating session", "title"),
      text(696, 34, "npm run rate · see RATING.md", "muted small", "end"),
    ];
    STEPS.forEach(([head, a, b, cmd], i) => {
      const y = top + i * row;
      if (i < STEPS.length - 1) o.push(`  <line class="rule" x1="44" x2="44" y1="${y + 34}" y2="${y + row + 4}" />`);
      o.push(
        `  <circle class="circle" cx="44" cy="${y + 20}" r="14" />`,
        text(44, y + 25, String(i + 1), "num", "middle"),
      );
      o.push(text(72, y + 25, head, "h"), text(72, y + 45, a, "muted"), text(72, y + 61, b, "muted"));
      o.push(rect(420, y + 4, 276, 62, "outline"), text(434, y + 30, cmd[0], "mono"));
      o.push(text(434, y + 50, cmd[1], cmd[1].trimStart().startsWith("#") || i === 3 ? "mono muted" : "mono"));
    });
    return page({
      width: W,
      height: H,
      theme,
      css: CSS,
      body: o,
      rx: 12,
      title: "A rating session, step by step",
      desc: STEPS.map(([h, a, b], i) => `${i + 1}. ${h}: ${a} ${b}`).join(" "),
    });
  },
};

/** The share of a game's information left at an Elo gap: 4p(1−p), 1 when the bots are level. */
const info = (gap: number) => {
  const p = 1 / (1 + 10 ** (-gap / 400));
  return 4 * p * (1 - p);
};

export const ratingReading: Diagram = {
  name: "rating-reading",
  png: false,
  draw(theme) {
    const o = [text(24, 34, "Reading a rating", "title")];
    // Left: three ways two ratings can sit.
    const strip = (
      y: number,
      lo: number,
      hi: number,
      rows: [string, number, number, number, string][],
      head: string,
      note: string,
    ) => {
      const X = (e: number) => 40 + ((e - lo) / (hi - lo)) * 290;
      o.push(text(24, y, head, "h"), text(24, y + 17, note, "muted small"));
      rows.forEach(([name, l, h, e, cls], k) => {
        const yy = y + 38 + k * 22;
        o.push(`  <line class="bar ${cls}" x1="${X(l).toFixed(1)}" x2="${X(h).toFixed(1)}" y1="${yy}" y2="${yy}" />`);
        o.push(`  <circle class="dot ${cls === "close" ? "close" : ""}" cx="${X(e).toFixed(1)}" cy="${yy}" r="4.5" />`);
        o.push(text(340, yy + 4, name, "small"));
      });
    };
    strip(
      70,
      1660,
      1790,
      [["Lookahead · 1729–1776", 1729, 1776, 1750, ""], ["Planner · 1680–1720", 1680, 1720, 1698, ""]],
      "Separate",
      "The ranges don't touch: the order is real.",
    );
    strip(
      166,
      1450,
      1525,
      [["Chainer · 1475–1515", 1475, 1515, 1494, "close"], ["Spoiler · 1459–1495", 1459, 1495, 1476, "close"]],
      "Too close to call",
      "The ranges overlap: either could be stronger.",
    );
    strip(
      262,
      1400,
      1500,
      [["Spoiler · 60 games", 1414, 1481, 1447, "old"], ["Spoiler · 240 games", 1459, 1495, 1476, ""]],
      "Noise, not a change",
      "The new rating sits inside the old range.",
    );
    // Right: what a game is worth by the Elo gap.
    const cx0 = 530, cx1 = 690, cy0 = 300, cy1 = 96;
    const gx = (g: number) => cx0 + (g / 800) * (cx1 - cx0), iy = (v: number) => cy0 - v * (cy0 - cy1);
    o.push(
      text(478, 70, "Close games tell you most", "h"),
      text(478, 87, "What a game is worth, by the Elo gap", "muted small"),
    );
    o.push(rect(gx(0), cy1, gx(200) - gx(0), cy0 - cy1, "tint", 0));
    for (const v of [0, 0.5, 1]) {
      o.push(`  <line class="rule" x1="${cx0}" x2="${cx1}" y1="${iy(v).toFixed(1)}" y2="${iy(v).toFixed(1)}" />`);
      o.push(text(cx0 - 8, iy(v) + 4, `${v * 100}%`, "muted small", "end"));
    }
    for (const g of [0, 200, 400, 800]) o.push(text(gx(g), cy0 + 16, String(g), "muted small", "middle"));
    o.push(text((cx0 + cx1) / 2, cy0 + 32, "Elo gap between the two bots", "muted small", "middle"));
    const points = Array.from({ length: 81 }, (_, k) => `${gx(k * 10).toFixed(1)},${iy(info(k * 10)).toFixed(1)}`);
    o.push(`  <polyline class="curve" points="${points.join(" ")}" />`);
    for (const g of [200, 400, 700]) {
      o.push(`  <circle class="mark" cx="${gx(g).toFixed(1)}" cy="${iy(info(g)).toFixed(1)}" r="4" />`);
      o.push(text(gx(g) + 6, iy(info(g)) - 8, `${Math.round(info(g) * 100)}%`, "small"));
    }
    o.push(
      text(gx(100), cy0 - 8, "place", "accent small", "middle"),
      text(gx(100), cy0 - 22, "aim to", "accent small", "middle"),
    );
    o.push(
      text(478, cy0 + 56, "A new bot earns its place within", "muted small"),
      text(478, cy0 + 71, "about 200 Elo of a neighbour, in a", "muted small"),
      text(478, cy0 + 86, "gap wider than that.", "muted small"),
    );
    return page({
      width: 720,
      height: 404,
      theme,
      css: CSS,
      body: o,
      rx: 12,
      title: "Reading a rating",
      desc: "Left: three ways two ratings can sit. Separate: Lookahead 1729 to 1776 and Planner 1680 to 1720 do not " +
        "overlap. Too close to call: Chainer 1475 to 1515 and Spoiler 1459 to 1495 overlap. Noise: Spoiler moved " +
        "from 1447 to 1476, inside its old range of 1414 to 1481. Right: how much a game tells you against the Elo " +
        "gap between the bots: 100% at no gap, 73% at 200, 33% at 400, 7% at 700. Place a new bot within about " +
        "200 Elo of a neighbour.",
    });
  },
};
