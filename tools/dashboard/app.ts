/**
 * The rating dashboard's page: draws each snapshot the run sends (snapshot.ts) as the ladder, the
 * bots' table, one bot against each of the others, the head-to-head table and the model check.
 * The clock ticks on its own between snapshots.
 */
import { DEFAULT_RULES, type GameState } from "../../src/game/types.ts";
import { formatGame, pitName, replay } from "../../src/game/notation.ts";
import { BoardView } from "../../src/ui/board.ts";
import type { PlayedGame } from "../tournament/play.ts";
import type { BotRow, Snapshot } from "./snapshot.ts";

const $ = (id: string) => document.getElementById(id)!;
const SVG = "http://www.w3.org/2000/svg";

let snap: Snapshot | null = null;
let receivedAt = 0;
let first = true;
/** The bot picked for the detail panel, by index; it stays picked as the order changes. */
let selected: number | null = null;
/** The head-to-head table: each pairing's score, or its games against the plan. */
let view: "score" | "games" = "score";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
const signed = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${-x}` : "±0");
const thousands = (x: number) => Math.round(x).toLocaleString("en");
function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0"), ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
const ms = (
  x: number | null,
) => (x === null ? "–" : x < 1 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : String(Math.round(x)));
const nameOf = (r: BotRow) => `${esc(r.level)} <span>· ${esc(r.label)}</span>`;

function select(i: number): void {
  selected = selected === i ? null : i;
  render();
}

// --- Status --------------------------------------------------------------------------------

function renderStatus(): void {
  if (!snap) return;
  const p = snap.progress;
  const since = p.status === "done" ? 0 : performance.now() - receivedAt;
  const what = p.status === "done" ? "Finished" : p.status === "stopping" ? "Stopping" : "Running";
  const unit = p.unit === "rounds"
    ? `round ${Math.min(p.done + 1, p.total)} of ${p.total}`
    : `${p.done} of ${p.total} pairs`;
  const eta = p.status === "done"
    ? ""
    : ` · ETA ${p.etaMs === null ? "after the first round" : clock(p.etaMs - since)}`;
  const status = $("status");
  status.dataset.status = p.status;
  status.innerHTML = `<span class="dot"></span> <strong>${what}</strong> <span class="mono">${
    p.status === "done" ? `${p.total} ${p.unit}` : unit
  } · ${thousands(p.games)} games · ${p.gamesPerSec.toFixed(1)} games/s · ${clock(p.elapsedMs + since)}${eta}</span>`;
  const done = p.status === "done" ? 1 : p.done / Math.max(1, p.total);
  ($("bar") as HTMLElement).style.width = `${Math.min(100, done * 100)}%`;
}

// --- The ladder ----------------------------------------------------------------------------

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderLadder(s: Snapshot): void {
  const svg = $("ladder") as unknown as SVGSVGElement;
  const W = 1000, rowH = 30, top = 26, left = 240, right = 130;
  const H = top + s.rows.length * rowH + 6;
  const values = s.rows.flatMap((
    r,
  ) => [r.elo, r.low ?? r.elo, r.high ?? r.elo, r.previous?.low ?? r.elo, r.previous?.high ?? r.elo]);
  const step = Math.max(...values) - Math.min(...values) > 700 ? 200 : 100;
  const lo = Math.floor((Math.min(...values) - 30) / step) * step;
  const hi = Math.ceil((Math.max(...values) + 30) / step) * step;
  const x = (elo: number) => left + ((elo - lo) / (hi - lo)) * (W - left - right - 30);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  for (let e = lo; e <= hi; e += step) {
    svg.append(
      el("line", { class: "grid", x1: x(e), x2: x(e), y1: top - 6, y2: H }),
      el("text", { class: "muted mono", x: x(e), y: 14, "text-anchor": "middle" }, String(e)),
    );
  }
  svg.append(el("text", { class: "muted mono", x: W - right + 14, y: 14 }, "Elo"));
  svg.append(el("text", { class: "muted mono", x: W - 8, y: 14, "text-anchor": "end" }, "change"));
  // Too close to call, as on the docs' ladder chart (tools/ladder.ts): a pair of neighbours whose
  // order holds in under 90% of the resampled fits. Both bots of the pair are marked.
  const unsure = (k: number) => k >= 0 && (s.rows[k]?.above ?? 1) < 0.9;
  s.rows.forEach((r, k) => {
    const y = top + k * rowH + rowH / 2;
    const close = unsure(k - 1) || unsure(k) ? " close" : "";
    const g = el("g", { class: `row${r.i === selected ? " selected" : ""}`, tabindex: 0, role: "button" });
    g.setAttribute("aria-label", `${r.level} ${r.label}: ${r.elo}`);
    g.append(el("rect", { class: "hit", x: 0, y: y - rowH / 2, width: W, height: rowH, rx: 6 }));
    const name = el("text", { x: left - 14, y: y + 4, "text-anchor": "end" });
    name.append(el("tspan", {}, r.level), el("tspan", { class: "muted" }, ` · ${r.label}`));
    g.append(name);
    if (r.previous) {
      g.append(
        el("rect", {
          class: "before",
          x: x(r.previous.low),
          y: y - 3,
          width: Math.max(2, x(r.previous.high) - x(r.previous.low)),
          height: 6,
          rx: 3,
        }),
        el("line", { class: "before-mark", x1: x(r.previous.elo), x2: x(r.previous.elo), y1: y - 6, y2: y + 6 }),
      );
    }
    if (r.low !== null && r.high !== null && r.i !== 0) {
      g.append(
        el("line", { class: `range${close}`, x1: x(r.low), x2: x(r.high), y1: y, y2: y }),
        el("line", { class: `range${close}`, x1: x(r.low), x2: x(r.low), y1: y - 5, y2: y + 5 }),
        el("line", { class: `range${close}`, x1: x(r.high), x2: x(r.high), y1: y - 5, y2: y + 5 }),
      );
    }
    g.append(el("circle", { class: `elo${close}`, cx: x(r.elo), cy: y, r: 5 }));
    g.append(el("text", { class: "mono", x: W - right + 14, y: y + 4 }, String(r.elo)));
    if (r.change !== null) {
      g.append(
        el(
          "text",
          { class: `mono${r.change < 0 ? " muted" : ""}`, x: W - 8, y: y + 4, "text-anchor": "end" },
          signed(r.change),
        ),
      );
    }
    g.addEventListener("click", () => select(r.i));
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(r.i);
      }
    });
    svg.append(g);
  });
  $("rangesNote").textContent = s.rangesGames === null
    ? "· ranges come after the first resample (about 10 s)"
    : s.progress.status === "done"
    ? "· final ranges"
    : `· ranges from the first ${thousands(s.rangesGames)} games`;
}

// --- The bots' table -----------------------------------------------------------------------

function renderTable(s: Snapshot): void {
  const head = `<thead><tr><th>Bot</th><th class="num">Elo</th><th class="num">90% range</th><th class="num">Before</th>
    <th class="num">Change</th><th class="num">Above next</th><th class="num">Gap to next</th><th class="num">Won</th><th class="num">Games</th>
    <th class="num">ms a move</th></tr></thead>`;
  const rows = s.rows.map((r) => {
    const range = r.i === 0 ? "anchor" : r.low === null ? "…" : `${r.low}–${r.high}`;
    const gap = !r.gap
      ? "–"
      : `${r.gap.elo}${r.gap.low === null ? "" : ` <span class="quiet">(${r.gap.low}–${r.gap.high})</span>`}`;
    const above = r.above === null ? "–" : `<span class="${r.above < 0.9 ? "unsure" : ""}">${pct(r.above)}</span>`;
    const change = r.change === null ? "–" : `<span class="${r.change < 0 ? "down" : ""}">${signed(r.change)}</span>`;
    return `<tr data-i="${r.i}" class="${r.i === selected ? "selected" : ""}">
      <td><button class="bot-name" type="button">${nameOf(r)}</button></td>
      <td class="num">${r.elo}</td><td class="num">${range}</td><td class="num">${r.previous?.elo ?? "new"}</td>
      <td class="num">${change}</td><td class="num">${above}</td><td class="num">${gap}</td><td class="num">${
      pct(r.score)
    }</td>
      <td class="num">${thousands(r.games)}</td><td class="num">${ms(r.msPerMove)}</td></tr>`;
  }).join("");
  const table = $("bots");
  table.innerHTML = `${head}<tbody>${rows}</tbody>`;
  for (const tr of table.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
    tr.addEventListener("click", () => select(Number(tr.dataset.i)));
  }
}

// --- One bot against each of the others -----------------------------------------------------

function renderDetail(s: Snapshot): void {
  const panel = $("detail");
  const r = s.rows.find((row) => row.i === selected);
  panel.hidden = !r;
  if (!r) return;
  const range = r.i === 0 ? "the anchor" : r.low === null ? "range to come" : `90%: ${r.low}–${r.high}`;
  const before = r.previous ? `before this run ${r.previous.elo}` : "new this run";
  const off = new Map(
    s.misfits.flatMap((m) => [[`${m.i} ${m.j}`, m.z], [`${m.j} ${m.i}`, -m.z]] as [string, number][]),
  );
  const bars = s.rows.filter((o) => o.i !== r.i).map((o) => {
    const score = s.score[r.i][o.i], games = s.games[r.i][o.i], expected = s.expected[r.i][o.i];
    const z = off.get(`${r.i} ${o.i}`);
    const note = games
      ? `${pct(score)} of ${thousands(games)} · predicted ${pct(expected)}${
        z === undefined ? "" : ` · off by ${Math.abs(z).toFixed(1)} SE`
      }`
      : "not played yet";
    return `<li data-o="${o.i}"><span>${nameOf(o)}</span>
      <span class="track"><span class="fill" style="width:${(score ?? 0) * 100}%"></span>
      <span class="expect" style="left:calc(${expected * 100}% - 1px)"></span></span>
      <span class="note${z === undefined ? "" : " off"}">${note}</span></li>`;
  }).join("");
  $("detailBody").innerHTML = `<div class="detail-head"><h3 class="serif">${esc(r.level)} · ${esc(r.label)}</h3>
    <p class="mono">${r.elo} (${range}) · ${before} · won ${pct(r.score)} of ${thousands(r.games)} · ${
    ms(r.msPerMove)
  } ms a move</p></div>
    <ul class="bars">${bars}</ul>
    <p class="dash-legend" style="margin:1rem 0 0">Bar: its score against each bot, strongest first.
    Mark: what the ratings predict. Click a bot's name to watch their games; click this bot again to close.</p>`;
}

// --- Head to head --------------------------------------------------------------------------

/** A pairing's games against its plan: shaded by how many are planned, underlined by how far along. */
function gamesCell(s: Snapshot, r: BotRow, c: BotRow, most: number): string {
  const played = s.games[r.i][c.i], planned = s.planned[r.i][c.i];
  const share = planned / most, along = Math.min(100, (played / Math.max(1, planned)) * 100);
  const title = `${r.label} against ${c.label}: ${played} of ${planned} games planned`;
  return `<td data-r="${r.i}" data-c="${c.i}" class="games${share > 0.6 ? " strong" : ""}" title="${
    esc(title)
  }" style="background-color:color-mix(in srgb, var(--text) ${
    Math.round(share * 70)
  }%, transparent);background-image:linear-gradient(to right, var(--accent-fill) ${along}%, transparent ${along}%)">${played}</td>`;
}

function renderMatrix(s: Snapshot): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>(".dash-views .btn")) {
    b.setAttribute("aria-pressed", String(b.dataset.view === view));
  }
  const planned = s.planned.flat().filter((g) => g > 0);
  const most = Math.max(...planned), fewest = Math.min(...planned);
  $("matrixLegend").textContent = view === "score"
    ? "Each row's score against each column, strongest first. Darker is a higher score."
    : s.run.adaptive
    ? `Games played in each pairing. Adaptive: ${fewest} to ${most} planned a pairing, more where the bots are close, ` +
      "since a lopsided pairing tells the fit little. Darker means more planned; the line shows how far along each one is."
    : `Games played in each pairing, of ${most} planned for every one; the line shows how far along each one is.`;
  const cols = s.rows.map((r) => `<th scope="col" title="${esc(r.label)}">${esc(r.level)}</th>`).join("");
  const body = s.rows.map((r) => {
    const cells = s.rows.map((c) => {
      if (c.i === r.i) return `<td class="self">–</td>`;
      if (view === "games") return gamesCell(s, r, c, most);
      const score = s.score[r.i][c.i], games = s.games[r.i][c.i];
      if (score === null) return `<td class="self">·</td>`;
      const title = `${r.label} against ${c.label}: ${pct(score)} of ${games} games; the ratings predict ${
        pct(s.expected[r.i][c.i])
      }`;
      return `<td data-r="${r.i}" data-c="${c.i}" class="${score > 0.6 ? "strong" : ""}" title="${esc(title)}"
        style="background:color-mix(in srgb, var(--text) ${Math.round(score * 70)}%, transparent)">${
        Math.round(score * 100)
      }</td>`;
    }).join("");
    return `<tr class="${r.i === selected ? "selected" : ""}"><th scope="row">${nameOf(r)}</th>${cells}</tr>`;
  }).join("");
  $("matrix").innerHTML = `<thead><tr><th></th>${cols}</tr></thead><tbody>${body}</tbody>`;
}

// --- Converging ----------------------------------------------------------------------------

/** Spreads labels apart vertically, keeping their order, at least `gap` apart and inside [lo, hi]. */
function spread(ys: number[], gap: number, lo: number, hi: number): number[] {
  const order = ys.map((y, k) => [y, k]).sort((a, b) => a[0] - b[0]);
  const out = ys.slice();
  let last = -Infinity;
  for (const [y, k] of order) last = out[k] = Math.max(y, last + gap);
  // Pushed past the bottom: shift the stack back up.
  const over = last - hi;
  if (over > 0) { for (const [, k] of order) out[k] = Math.max(lo, out[k] - over); }
  return out;
}

const path = (pts: [number, number][]) =>
  pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");

/** Gridlines and labels for games along the bottom. */
function axisX(svg: SVGSVGElement, x: (g: number) => number, max: number, y0: number, y1: number): void {
  const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000];
  const step = steps.find((s) => max / s <= 6) ?? 100_000;
  for (let g = 0; g <= max; g += step) {
    svg.append(
      el("line", { class: "grid", x1: x(g), x2: x(g), y1: y0, y2: y1 }),
      el("text", { x: x(g), y: y1 + 16, "text-anchor": "middle" }, thousands(g)),
    );
  }
}

/** Every bot's rating over the games played; the selected bot on top, with its 90% range. */
function renderConverge(s: Snapshot): void {
  const svg = $("converge") as unknown as SVGSVGElement;
  const { points, ranges } = s.history;
  const W = 1000, H = 380, left = 52, right = 150, top = 12, bottom = 30;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  if (points.length < 2) {
    svg.append(el("text", { x: W / 2, y: H / 2, "text-anchor": "middle" }, "Drawn from the second round on"));
    return;
  }
  const max = points.at(-1)!.games;
  const all = points.flatMap((p) => p.elo);
  const lo = Math.floor((Math.min(...all) - 20) / 100) * 100, hi = Math.ceil((Math.max(...all) + 20) / 100) * 100;
  const x = (g: number) => left + (g / max) * (W - left - right);
  const y = (e: number) => top + ((hi - e) / (hi - lo)) * (H - top - bottom);
  axisX(svg, x, max, top, H - bottom);
  const step = hi - lo > 1000 ? 400 : 200;
  for (let e = Math.ceil(lo / step) * step; e <= hi; e += step) {
    svg.append(
      el("line", { class: "grid", x1: left, x2: W - right, y1: y(e), y2: y(e) }),
      el("text", { x: left - 8, y: y(e) + 4, "text-anchor": "end" }, String(e)),
    );
  }
  if (selected !== null && ranges.length > 1) {
    const i = selected;
    const upper = ranges.map((r): [number, number] => [x(Math.min(r.games, max)), y(r.high[i])]);
    const lower = ranges.map((r): [number, number] => [x(Math.min(r.games, max)), y(r.low[i])]).reverse();
    svg.append(el("path", { class: "band", d: path([...upper, ...lower]) + "Z" }));
  }
  const bots = s.rows.map((r) => r.i);
  // The others first, so the selected bot's line draws on top.
  for (const i of [...bots.filter((b) => b !== selected), ...bots.filter((b) => b === selected)]) {
    svg.append(el("path", {
      class: `line${i === selected ? " selected" : ""}`,
      d: path(points.map((p) => [x(p.games), y(p.elo[i])])),
    }));
  }
  const ends = spread(bots.map((i) => y(points.at(-1)!.elo[i]) + 4), 14, top + 8, H - bottom);
  bots.forEach((i, k) => {
    const r = s.rows.find((row) => row.i === i)!;
    const label = el(
      "text",
      { class: `name${i === selected ? " selected" : ""}`, x: W - right + 8, y: ends[k] },
      r.level,
    );
    label.addEventListener("click", () => select(i));
    svg.append(label);
  });
}

/** The widest and the median 90% range (±, half its width) over the games played. */
function renderWidths(s: Snapshot): void {
  const svg = $("widths") as unknown as SVGSVGElement;
  const W = 600, H = 380, left = 44, right = 16, top = 12, bottom = 30;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  // Every bot but the anchor, whose range is its rating.
  const rows = s.history.ranges.map((r) => {
    const half = r.low.map((low, i) => (r.high[i] - low) / 2).filter((_, i) => i !== 0).sort((a, b) => a - b);
    return { games: r.games, widest: half.at(-1)!, median: half[Math.floor(half.length / 2)] };
  });
  const goal = 25;
  const follow = "Click a bot (here, on the ladder or in the table) to follow it, with its 90% range.";
  if (rows.length < 2) {
    svg.append(el("text", { x: W / 2, y: H / 2, "text-anchor": "middle" }, "Drawn from the second resample on"));
    $("convergeNote").textContent =
      `Ratings are drawn every round (every 50 pairs, adaptive), the ranges about every 10 seconds. ${follow}`;
    return;
  }
  const max = Math.max(...rows.map((r) => r.games));
  const ceiling = Math.max(goal * 2, ...rows.map((r) => r.widest));
  const x = (g: number) => left + (g / max) * (W - left - right);
  const y = (v: number) => top + ((ceiling - v) / ceiling) * (H - top - bottom);
  axisX(svg, x, max, top, H - bottom);
  for (let v = 0; v <= ceiling; v += ceiling > 150 ? 50 : 25) {
    svg.append(
      el("line", { class: "grid", x1: left, x2: W - right, y1: y(v), y2: y(v) }),
      el("text", { x: left - 8, y: y(v) + 4, "text-anchor": "end" }, String(v)),
    );
  }
  svg.append(
    el("line", { class: "goal", x1: left, x2: W - right, y1: y(goal), y2: y(goal) }),
    el("text", { x: W - right, y: y(goal) - 6, "text-anchor": "end" }, "±25: a full 240-game run"),
    el("path", { class: "median", d: path(rows.map((r) => [x(r.games), y(r.median)])) }),
    el("path", { class: "widest", d: path(rows.map((r) => [x(r.games), y(r.widest)])) }),
  );
  const last = rows.at(-1)!;
  $("convergeNote").textContent =
    `Now the widest range is ±${Math.round(last.widest)} and the median ±${
      Math.round(last.median)
    } (right: solid is the widest, dashed the median). Ranges narrow about as 1/√games: half as wide takes four times ` +
    `the games. ${follow}`;
}

// --- Watching the games --------------------------------------------------------------------

const viewer = {
  games: [] as PlayedGame[],
  game: 0,
  step: 0,
  states: [] as GameState[],
  results: [] as ReturnType<typeof replay>["results"],
  timer: undefined as ReturnType<typeof setInterval> | undefined,
};
let board: BoardView | null = null;
const level = (i: number) => snap?.rows.find((row) => row.i === i)?.level ?? `Bot ${i}`;
const botName = (i: number) => {
  const r = snap?.rows.find((row) => row.i === i);
  return r ? `${r.level} (${r.label})` : `Bot ${i}`;
};

/** Opens the viewer on a pairing's kept games (the first 10 matched pairs, as they're played). */
async function openViewer(a: number, b: number): Promise<void> {
  const games = (await (await fetch(`games?i=${a}&j=${b}`)).json()) as PlayedGame[];
  stopPlaying();
  Object.assign(viewer, { games, game: 0, step: 0 });
  const section = $("viewer");
  section.hidden = false;
  $("viewerTitle").textContent = `${botName(a)} against ${botName(b)}`;
  board ??= new BoardView($("board"));
  if (!games.length) {
    $("viewerInfo").textContent =
      "No games kept for this pairing yet: the viewer keeps each pairing's first 10 matched pairs, as they're played.";
    $("viewerMove").textContent = "";
    $("viewerMgn").textContent = "";
    board.render(new Array(16).fill(0));
  } else showGame(0);
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showGame(k: number): void {
  const g = viewer.games[k];
  const record = { tags: {}, rules: { ...DEFAULT_RULES }, first: g.first, layout: g.layout, moves: g.moves };
  const { states, results } = replay(record);
  Object.assign(viewer, { game: k, step: 0, states, results });
  const end = states.at(-1)!;
  const [s1, s2] = g.seats;
  const result = g.winner === null ? "a draw" : `${level(g.winner === 1 ? s1 : s2)} won`;
  const opening = snap?.run.opening === "random-moves" ? " Moves 1 and 2 are the opening's random moves." : "";
  $("viewerInfo").textContent = `Game ${k + 1} of ${viewer.games.length} · Player 1: ${botName(s1)} · Player 2: ${
    botName(s2)
  } · ${result}, ${end.pits[14]}–${end.pits[15]}.${opening}`;
  $("viewerMgn").textContent = formatGame(record);
  board!.setStoreLabels({ 1: level(s1), 2: level(s2) });
  showStep(0);
}

function showStep(step: number): void {
  const { states, results } = viewer;
  viewer.step = Math.max(0, Math.min(step, states.length - 1));
  const state = states[viewer.step];
  board!.render(state.pits);
  // A replay: no pit can be played, and each reads its count to a screen reader.
  board!.setPlayable(new Set(), (pit, seeds) => `Pit ${pitName(pit)}: ${seeds} seeds`, state.pits);
  board!.setTurn(state.gameOver ? null : state.current);
  const r = viewer.step ? results[viewer.step - 1] : null;
  board!.sowingFrom(r ? r.move : null);
  const seat = (p: number) => level(viewer.games[viewer.game].seats[p - 1]);
  $("viewerMove").textContent = !r
    ? `The start: Player ${state.current} (${seat(state.current)}) to move.`
    : `Move ${viewer.step} of ${results.length}: ${seat(r.player)} plays pit ${pitName(r.move)}` +
      (r.relays ? `, relays ${r.relays} ${r.relays === 1 ? "time" : "times"}` : "") +
      (r.captured ? `, captures ${r.captured}` : "") +
      (r.freeTurn && !state.gameOver ? ", and moves again" : "") +
      (state.gameOver ? `. Game over, ${state.pits[14]}–${state.pits[15]}.` : ".");
  if (viewer.step === states.length - 1) stopPlaying();
}

function stopPlaying(): void {
  clearInterval(viewer.timer);
  viewer.timer = undefined;
  const play = document.querySelector<HTMLButtonElement>('[data-go="play"]');
  if (play) play.textContent = "Play";
}

function go(action: string): void {
  if (!viewer.games.length) return;
  if (action === "play") {
    if (viewer.timer) return stopPlaying();
    if (viewer.step === viewer.states.length - 1) showStep(0);
    viewer.timer = setInterval(() => showStep(viewer.step + 1), 600);
    document.querySelector<HTMLButtonElement>('[data-go="play"]')!.textContent = "Pause";
    return;
  }
  stopPlaying();
  if (action === "start") showStep(0);
  else if (action === "back") showStep(viewer.step - 1);
  else if (action === "forward") showStep(viewer.step + 1);
  else if (action === "end") showStep(viewer.states.length - 1);
  else if (action === "prevGame") showGame((viewer.game - 1 + viewer.games.length) % viewer.games.length);
  else if (action === "nextGame") showGame((viewer.game + 1) % viewer.games.length);
}

for (const b of document.querySelectorAll<HTMLButtonElement>("[data-go]")) {
  b.addEventListener("click", () => go(b.dataset.go!));
}
document.addEventListener("keydown", (e) => {
  if ($("viewer").hidden || (e.target as HTMLElement).closest("input, select, textarea")) return;
  const action = ({ ArrowLeft: "back", ArrowRight: "forward", Home: "start", End: "end" } as Record<string, string>)[
    e.key
  ];
  if (!action) return;
  e.preventDefault();
  go(action);
});
$("matrix").addEventListener("click", (e) => {
  const td = (e.target as HTMLElement).closest<HTMLElement>("td[data-c]");
  if (td) void openViewer(Number(td.dataset.r), Number(td.dataset.c));
});
$("detailBody").addEventListener("click", (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-o]");
  if (li && selected !== null) void openViewer(selected, Number(li.dataset.o));
});

// --- Model check and footer ----------------------------------------------------------------

function renderCheck(s: Snapshot): void {
  const label = (i: number) => {
    const r = s.rows.find((row) => row.i === i)!;
    return `${esc(r.level)} (${esc(r.label)})`;
  };
  $("check").innerHTML = s.misfits.length
    ? `<p>${s.misfits.length} pairing${s.misfits.length === 1 ? "" : "s"} the ratings don't explain
      (more than 3 standard errors off):</p><ul>${
      s.misfits.map((m) =>
        `<li>${label(m.i)} against ${label(m.j)}: scored ${pct(m.observed)}, the ratings say ${pct(m.expected)}
          <span class="quiet mono">(${m.z > 0 ? "+" : ""}${m.z.toFixed(1)})</span></li>`
      ).join("")
    }</ul>`
    : `<p>Every pairing's score is within chance of what the ratings predict.</p>`;
  const openings: Record<string, string> = {
    "random-moves": "the standard board after two random moves",
    symmetric: "random boards the same from both seats",
    standard: "the standard board",
  };
  $("meta").textContent = `${
    s.run.adaptive
      ? `Adaptive, from ${s.run.gamesPerPairing} games at 50/50`
      : `${s.run.gamesPerPairing} games a pairing`
  } · ` +
    `openings: ${openings[s.run.opening] ?? s.run.opening} · ${s.run.workers} workers`;
  $("foot").textContent = `${
    s.firstMoverWon === null ? "" : `The player moving first won ${pct(s.firstMoverWon)} of decided games. `
  }Updates at most once a second; ranges about every 10 seconds, on a thread of their own. Random is the anchor, pinned at 1000.`;
}

function render(): void {
  if (!snap) return;
  renderStatus();
  renderLadder(snap);
  renderConverge(snap);
  renderWidths(snap);
  renderTable(snap);
  renderDetail(snap);
  renderMatrix(snap);
  renderCheck(snap);
}

for (const b of document.querySelectorAll<HTMLButtonElement>(".dash-views .btn")) {
  b.addEventListener("click", () => {
    view = b.dataset.view === "games" ? "games" : "score";
    if (snap) renderMatrix(snap);
  });
}

const events = new EventSource("events");
events.onmessage = (e) => {
  snap = JSON.parse(e.data) as Snapshot;
  receivedAt = performance.now();
  // An adaptive run opens on the Games view, where its allocation shows; after that, the reader chooses.
  if (first && snap.run.adaptive) view = "games";
  first = false;
  render();
};
events.onerror = () => {
  if (snap?.progress.status === "done") return;
  $("status").innerHTML = `<span class="dot"></span> <strong>Not connected</strong>
    <span class="mono">the run has stopped, or hasn't started; this page reconnects on its own</span>`;
};
setInterval(() => snap?.progress.status !== "done" && renderStatus(), 1000);
