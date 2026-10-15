/**
 * Draws the bots' Elo ladder, with each 90% range, as docs/ladder.svg (shown in the README). Two
 * neighbours are marked when one's rating falls inside the other's range: too close to call yet.
 * (Ranges that merely touch are common and say little.)
 *
 *   deno task ladder        after `deno task rate --write`
 *
 * The colours are the design guide's (docs/DESIGN.md), light and dark.
 */
import { type BotId, BOTS } from "../src/bots/bots.ts";
import { RATINGS, RATINGS_VERSION } from "../src/bots/ratings.ts";

const rows = (Object.keys(BOTS) as BotId[])
  .filter((id) => RATINGS[id])
  .map((id) => ({ id, ...BOTS[id], ...RATINGS[id] }))
  .sort((a, b) => b.elo - a.elo);

// Too close to call: a neighbour's rating inside this range, or this rating inside the neighbour's.
const inside = (v: number, r: { low: number; high: number }) => r.low < r.high && r.low <= v && v <= r.high;
const overlaps = rows.map((r, i) =>
  [rows[i - 1], rows[i + 1]].some((n) => n && (inside(n.elo, r) || inside(r.elo, n)))
);

const W = 720, L = 230, R = 70, top = 44, rowH = 28;
const H = top + rows.length * rowH + 52;
const lo = Math.floor((Math.min(...rows.map((r) => r.low)) - 20) / 250) * 250;
const hi = Math.ceil((Math.max(...rows.map((r) => r.high)) + 40) / 250) * 250;
const x = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R);
const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

let body = "";
for (let v = lo; v <= hi; v += 250) {
  body += `<line class="grid" x1="${x(v)}" x2="${x(v)}" y1="${top - 8}" y2="${H - 44}"/>` +
    `<text class="tick" x="${x(v)}" y="${H - 28}" text-anchor="middle">${v}</text>`;
}
rows.forEach((r, i) => {
  const y = top + i * rowH + rowH / 2;
  const cls = overlaps[i] ? "mark overlap" : "mark";
  body += `<text class="name" x="${L - 14}" y="${y + 4}" text-anchor="end">${esc(r.level)} ` +
    `<tspan class="muted">· ${esc(r.label)}</tspan></text>`;
  if (r.low !== r.high) {
    body += `<line class="${cls}" x1="${x(r.low)}" x2="${x(r.high)}" y1="${y}" y2="${y}"/>` +
      `<line class="${cls}" x1="${x(r.low)}" x2="${x(r.low)}" y1="${y - 5}" y2="${y + 5}"/>` +
      `<line class="${cls}" x1="${x(r.high)}" x2="${x(r.high)}" y1="${y - 5}" y2="${y + 5}"/>`;
  }
  body += `<circle class="dot${overlaps[i] ? " overlap" : ""}" cx="${x(r.elo)}" cy="${y}" r="5"/>` +
    `<text class="value" x="${x(r.high) + 10}" y="${y + 4}">${r.elo}${r.low === r.high ? " (anchor)" : ""}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
  aria-labelledby="t d">
<title id="t">The bots' Elo ladder</title>
<desc id="d">${rows.map((r) => `${r.label} ${r.elo} (${r.low}–${r.high})`).join(", ")}</desc>
<style>
  svg { --ink: #161514; --muted: #6b6760; --rule: #dfdad0; --accent: #a8483f; --bg: #f6f4ef; }
  @media (prefers-color-scheme: dark) {
    svg { --ink: #f6f4ef; --muted: rgba(246,244,239,0.62); --rule: rgba(246,244,239,0.14); --accent: #e39a86; --bg: #161514; }
  }
  text { font: 12px Inter, system-ui, sans-serif; fill: var(--ink); }
  .muted, .tick, .note { fill: var(--muted); }
  .tick, .note { font-size: 11px; }
  .title { font: 400 20px "Instrument Serif", Georgia, serif; }
  .grid { stroke: var(--rule); }
  .mark { stroke: var(--muted); stroke-width: 2; stroke-linecap: round; }
  .mark.overlap { stroke: var(--accent); }
  .dot { fill: var(--ink); stroke: var(--bg); stroke-width: 2; }
  .dot.overlap { fill: var(--accent); }
  .bg { fill: var(--bg); }
  .accent { fill: var(--accent); }
</style>
<rect class="bg" width="${W}" height="${H}" rx="12"/>
<text class="title" x="24" y="30">The bots, by Elo</text>
<text class="note" x="${
  W - 24
}" y="30" text-anchor="end">Dot: rating · bar: 90% range · <tspan class="accent">red: too close to call</tspan></text>
${body}
<text class="note" x="24" y="${
  H - 10
}">Random is pinned at 1000. Ratings from deno task rate, ${RATINGS_VERSION}.</text>
</svg>
`;
await Deno.writeTextFile(new URL("../docs/ladder.svg", import.meta.url), svg);
console.log(
  `Wrote docs/ladder.svg: ${rows.length} bots, ${overlaps.filter(Boolean).length} too close to a neighbour to call.`,
);
