/** The "Your games" dialog: your rating and its trend, your record against each bot, recent games. */
import { type BotId, BOTS, DORMANT, type DormantId, isDormantId } from "../bots/bots.ts";
import { RATINGS } from "../bots/ratings.ts";
import { humanSide, playerStats, type SavedGame, seatName, START_RATING } from "../app/history.ts";

export interface StatsEls {
  rating: HTMLElement;
  summary: HTMLElement;
  trend: SVGSVGElement;
  vs: HTMLTableElement;
  games: HTMLOListElement;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The rating's path over rated games, as a small line. */
function trendPath(trend: number[]): string {
  const points = [START_RATING, ...trend];
  if (points.length < 2) return "";
  const lo = Math.min(...points) - 10, hi = Math.max(...points) + 10;
  return points.map((v, i) => {
    const x = (i / (points.length - 1)) * 300;
    const y = 56 - ((v - lo) / (hi - lo)) * 52;
    return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function renderStats(els: StatsEls, games: SavedGame[]): void {
  const s = playerStats(games);
  els.rating.textContent = String(s.rating);
  els.summary.textContent = s.played === 0
    ? "No games yet. Finish a game against a bot to start your rating."
    : `${s.played} ${s.played === 1 ? "game" : "games"} saved, ${s.rated} rated. Everyone starts at ${START_RATING}, ` +
      `where the Easy bot (Random) sits.`;

  const path = trendPath(s.trend);
  els.trend.innerHTML = path
    ? `<path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`
    : "";
  els.trend.toggleAttribute("hidden", !path);

  // Your record against each bot you've played, in the menu's order
  // Bots made dormant since come after the current ones, so old games still show.
  const ids = [...Object.keys(BOTS), ...Object.keys(DORMANT)] as (BotId | DormantId)[];
  const rows = ids.filter((id) => s.vs.has(id)).map((id) => {
    const r = s.vs.get(id)!;
    const n = r.w + r.l + r.d;
    const spec = isDormantId(id) ? DORMANT[id] : BOTS[id];
    return `<tr><td>${spec.level} <span class="muted">${spec.label}</span></td>` +
      `<td class="mono">${RATINGS[id]?.elo ?? "–"}</td><td class="mono">${r.w}–${r.l}${r.d ? `–${r.d}` : ""}</td>` +
      `<td class="mono">${Math.round(((r.w + r.d / 2) / n) * 100)}%</td></tr>`;
  });
  els.vs.innerHTML = rows.length
    ? `<thead><tr><th>Bot</th><th>Elo</th><th>W–L</th><th>Score</th></tr></thead><tbody>${rows.join("")}</tbody>`
    : "";
  els.vs.hidden = !rows.length;

  // The 15 most recent games
  els.games.innerHTML = games.map((g, i) => ({ g, i })).slice(-15).reverse().map(({ g, i }) => {
    const me = humanSide(g.seats);
    const when = new Date(g.at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const who = me
      ? `You vs ${seatName(g.seats[me === 1 ? 2 : 1])}`
      : `${seatName(g.seats[1])} vs ${seatName(g.seats[2])}`;
    const outcome = g.winner === null ? "Draw" : me ? (g.winner === me ? "Won" : "Lost") : `Player ${g.winner} won`;
    const [a, b] = me === 2 ? [g.score[1], g.score[0]] : g.score;
    const delta = s.change.get(i);
    const tag = delta !== undefined
      ? `<span class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : "−"}${Math.abs(Math.round(delta))}</span>`
      : `<span class="muted">unrated</span>`;
    // Say why a game didn't count, where it can be read on a phone too
    const why = delta === undefined && g.unratedBecause
      ? `<small class="stats-why">Not rated: ${esc(g.unratedBecause)}</small>`
      : "";
    return `<li><span class="mono muted">${when}</span><span>${
      esc(who)
    }</span><span>${outcome}, ${a}–${b}</span>${tag}${why}</li>`;
  }).join("");
}
