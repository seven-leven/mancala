/**
 * MGN, mancala game notation: one game as text, like chess's PGN. Tags first, then the moves:
 *
 *   [P1 "minimax"]
 *   [P2 "greedy"]
 *   [Rules "seeds=7 capture=own clinch=on"]
 *   [First "1"]
 *   [Result "52-46"]
 *
 *   1. 1+ 4+ 2x 6 2. 3 ... 52-46
 *
 * A move is the pit played, counted 1–7 from the mover's own left (the keyboard keys), so it reads
 * the same from either seat. "+" marks a free turn (the same player moves again) and "x" a capture.
 * Turn numbers count the first player's turns; they're for reading and are ignored when parsing.
 * [Start] gives a board other than the standard one: each side's pits from its own left.
 *
 * The moves are replayed through the engine both ways, so a game that formats or parses is legal.
 */
import { newGame, playTurn } from "./engine.ts";
import { DEFAULT_RULES, type GameState, P1, P2, type Player, type Rules } from "./types.ts";

export interface GameRecord {
  /** Every tag, including the ones read into the fields below (P1, P2, Event, Date...). */
  tags: Record<string, string>;
  rules: Rules;
  first: Player;
  /** Pits 0–13 at the start, when it isn't the standard board. */
  layout?: number[];
  /** The pits played, as engine indices (0–13), in order. */
  moves: number[];
}

/** A move as written: pit 1–7 from the mover's own left. Player 2's left is pit 13. */
export const pitName = (pit: number): number => (pit <= 6 ? pit + 1 : 14 - pit);
const pitIndex = (name: number, mover: Player): number => (mover === P1 ? name - 1 : 14 - name);

const rulesTag = (r: Rules) => `seeds=${r.seeds} capture=${r.capture} clinch=${r.clinch ? "on" : "off"}`;
function parseRules(tag: string | undefined): Rules {
  if (!tag) return { ...DEFAULT_RULES };
  const kv = Object.fromEntries(tag.split(/\s+/).map((p) => p.split("=")));
  return {
    seeds: Number(kv.seeds ?? DEFAULT_RULES.seeds),
    capture: kv.capture === "any" ? "any" : "own",
    clinch: kv.clinch !== "off",
  };
}
/** "7 7 7 7 7 7 7 | 7 7 7 7 7 7 7": Player 1's pits from their left, then Player 2's from theirs. */
const startTag = (pits: readonly number[]) =>
  `${pits.slice(0, 7).join(" ")} | ${pits.slice(7, 14).reverse().join(" ")}`;
function parseStart(tag: string): number[] {
  const [a, b] = tag.split("|").map((side) => side.trim().split(/\s+/).map(Number));
  if (a?.length !== 7 || b?.length !== 7) throw new Error(`[Start "${tag}"]: needs 7 pits a side`);
  return [...a, ...b.reverse()];
}

/** The positions a game passes through, from the start to the end, and each move's result. */
export function replay(
  game: GameRecord,
): { states: GameState[]; results: Extract<ReturnType<typeof playTurn>, { invalid: false }>[] } {
  let g = newGame(game.rules, game.first, game.layout);
  const states = [g];
  const results = [];
  for (const [k, move] of game.moves.entries()) {
    const r = playTurn(g, move, { record: false });
    if (r.invalid) throw new Error(`move ${k + 1} (pit ${move}) isn't legal there`);
    results.push(r);
    states.push(g = r.state);
  }
  return { states, results };
}

/** A game as MGN text. */
export function formatGame(game: GameRecord): string {
  const { states, results } = replay(game);
  const tags: Record<string, string> = {
    ...game.tags,
    Rules: rulesTag(game.rules),
    First: String(game.first),
    ...(game.layout ? { Start: startTag(game.layout) } : {}),
  };
  const end = states.at(-1)!;
  const score = `${end.pits[14]}-${end.pits[15]}`;
  if (end.gameOver) tags.Result = score;
  const tokens: string[] = [];
  let turn = 0;
  for (const [k, r] of results.entries()) {
    const startsTurn = k === 0 || !results[k - 1].freeTurn;
    if (startsTurn && r.player === game.first) tokens.push(`${++turn}.`);
    tokens.push(`${pitName(r.move)}${r.captured ? "x" : ""}${r.freeTurn && !r.gameOver ? "+" : ""}`);
  }
  if (end.gameOver) tokens.push(score);
  const lines = Object.entries(tags).map(([k, v]) => `[${k} "${v.replaceAll('"', "'")}"]`);
  return `${lines.join("\n")}\n\n${wrap(tokens)}\n`;
}

/** Joins tokens into lines of at most 80 characters. */
function wrap(tokens: string[]): string {
  const lines = [""];
  for (const t of tokens) {
    if (lines.at(-1)!.length + t.length + 1 > 80) lines.push("");
    lines[lines.length - 1] += (lines.at(-1) ? " " : "") + t;
  }
  return lines.join("\n");
}

/** One game from MGN text. Throws if a move is illegal or its marks don't match what happened. */
export function parseGame(text: string): GameRecord {
  const tags: Record<string, string> = {};
  for (const m of text.matchAll(/^\[(\w+)\s+"([^"]*)"\]\s*$/gm)) tags[m[1]] = m[2];
  const body = text.replace(/^\[.*\]\s*$/gm, " ");
  const rules = parseRules(tags.Rules);
  const first: Player = tags.First === "2" ? P2 : P1;
  const layout = tags.Start ? parseStart(tags.Start) : undefined;

  let g = newGame(rules, first, layout);
  const moves: number[] = [];
  for (const token of body.split(/\s+/)) {
    if (!token || /^\d+\.$/.test(token) || token === "..." || /^\d+-\d+$/.test(token)) continue;
    const m = /^([1-7])(x?)(\+?)$/.exec(token);
    if (!m) throw new Error(`"${token}" isn't a move`);
    const pit = pitIndex(Number(m[1]), g.current);
    const r = playTurn(g, pit, { record: false });
    if (r.invalid) throw new Error(`move ${moves.length + 1} ("${token}") isn't legal there`);
    if (!!m[2] !== r.captured > 0 || !!m[3] !== (r.freeTurn && !r.gameOver)) {
      throw new Error(`move ${moves.length + 1} ("${token}"): the marks don't match what the move did`);
    }
    moves.push(pit);
    g = r.state;
  }
  return { tags, rules, first, layout, moves };
}

/** Several games, one after another: a tag line after a game's moves starts the next game. */
export function parseGames(text: string): GameRecord[] {
  const games: string[][] = [[]];
  let moved = false;
  for (const line of text.split(/\r?\n/)) {
    const tag = /^\[\w+\s+"/.test(line);
    if (tag && moved) [games[games.length], moved] = [[], false];
    if (!tag && line.trim()) moved = true;
    games.at(-1)!.push(line);
  }
  return games.map((g) => g.join("\n")).filter((g) => g.trim()).map(parseGame);
}
