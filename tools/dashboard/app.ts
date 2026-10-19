/**
 * The rating dashboard's page: draws each snapshot the run sends (snapshot.ts) as the ladder, the
 * bots' table, one bot against each of the others, the head-to-head table and the model check.
 * The clock ticks on its own between snapshots.
 */
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
    <th class="num">Change</th><th class="num">Above next</th><th class="num">Won</th><th class="num">Games</th>
    <th class="num">ms a move</th></tr></thead>`;
  const rows = s.rows.map((r) => {
    const range = r.i === 0 ? "anchor" : r.low === null ? "…" : `${r.low}–${r.high}`;
    const above = r.above === null ? "–" : `<span class="${r.above < 0.9 ? "unsure" : ""}">${pct(r.above)}</span>`;
    const change = r.change === null ? "–" : `<span class="${r.change < 0 ? "down" : ""}">${signed(r.change)}</span>`;
    return `<tr data-i="${r.i}" class="${r.i === selected ? "selected" : ""}">
      <td><button class="bot-name" type="button">${nameOf(r)}</button></td>
      <td class="num">${r.elo}</td><td class="num">${range}</td><td class="num">${r.previous?.elo ?? "new"}</td>
      <td class="num">${change}</td><td class="num">${above}</td><td class="num">${pct(r.score)}</td>
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
    return `<li><span>${nameOf(o)}</span>
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
    Mark: what the ratings predict. Click the bot again to close.</p>`;
}

// --- Head to head --------------------------------------------------------------------------

/** A pairing's games against its plan: shaded by how many are planned, underlined by how far along. */
function gamesCell(s: Snapshot, r: BotRow, c: BotRow, most: number): string {
  const played = s.games[r.i][c.i], planned = s.planned[r.i][c.i];
  const share = planned / most, along = Math.min(100, (played / Math.max(1, planned)) * 100);
  const title = `${r.label} against ${c.label}: ${played} of ${planned} games planned`;
  return `<td class="games${share > 0.6 ? " strong" : ""}" title="${
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
      return `<td class="${score > 0.6 ? "strong" : ""}" title="${esc(title)}"
        style="background:color-mix(in srgb, var(--text) ${Math.round(score * 70)}%, transparent)">${
        Math.round(score * 100)
      }</td>`;
    }).join("");
    return `<tr class="${r.i === selected ? "selected" : ""}"><th scope="row">${nameOf(r)}</th>${cells}</tr>`;
  }).join("");
  $("matrix").innerHTML = `<thead><tr><th></th>${cols}</tr></thead><tbody>${body}</tbody>`;
}

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
