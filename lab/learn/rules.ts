/**
 * Decompiles Intuition's policy net into the Rule list bot's rules (src/bots/search/rules.ts): an
 * ordered list of if/then rules, mined one at a time to copy the net's choices.
 *
 *   node lab/learn/rules.ts data/learn/positions.jsonl [data/learn/policy.jsonl]
 *
 * Each round tries every rule (a condition on a move's facts, and a way to choose among the moves
 * that pass), on the positions no earlier rule decided; keeps the one that most often picks the
 * net's move, among those that decide at least 2% of them; and sets those positions aside. A last
 * rule that every move passes decides the rest. Given policy-data.ts's file too, it also reports
 * how often the rules, the net and Greedy play Minimax's move.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { POLICY_WEIGHTS } from "../../src/bots/search/policy-weights.ts";
import { PolicyNet } from "../../src/bots/search/policy.ts";
import { factsOf, followRules, type MoveFacts, pickBy, type Rule } from "../../src/bots/search/rules.ts";
import { Boards } from "../../src/bots/search/moves.ts";
import { pitsOf } from "../../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, type Player } from "../../src/game/types.ts";

const [file, policyFile] = process.argv.slice(2);
const MAX_RULES = 9, MIN_SHARE = 0.02;
type Row = { pits: number[]; toMove: Player; move?: number };
const read = (f: string): Row[] => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const state = (r: Row): GameState => ({ rules: DEFAULT_RULES, pits: r.pits, current: r.toMove, gameOver: false });
const net = new PolicyNet(POLICY_WEIGHTS);
const boards = new Boards();

// Every position's move facts, and the net's move.
const positions = read(file).slice(0, 30_000).map((r) => {
  const s = state(r);
  return { facts: factsOf(s, boards), target: net.choose(s)! };
});

// The rules to try.
const picks: Rule["pick"][] = ["bank", "net", "give", "near", "far"];
const conds: Omit<Rule, "pick">[] = [{ wins: true }, { free: true }];
for (const minBank of [0, 1, 2, 3, 4, 6, 8, 10]) {
  for (const maxGive of [undefined, 0, 1, 2, 3, 4, 6]) {
    if (minBank || maxGive !== undefined) conds.push({ minBank: minBank || undefined, maxGive });
  }
}
for (const minNet of [0, 1, 2, 3, 5, 8]) conds.push({ minNet });
const candidates: Rule[] = conds.flatMap((c) => picks.map((pick) => ({ ...c, pick })));

const english = (r: Rule) => {
  const ifs: string[] = [];
  if (r.wins) ifs.push("wins the game now");
  if (r.free) ifs.push("earns a free turn");
  if (r.minBank) ifs.push(`banks ${r.minBank} or more`);
  if (r.maxGive !== undefined) {
    ifs.push(r.maxGive === 0 ? "leaves them nothing to bank" : `leaves them at most ${r.maxGive} to bank`);
  }
  if (r.minNet !== undefined) ifs.push(`banks at least ${r.minNet} more than it leaves them`);
  const then = {
    bank: "the one that banks most",
    net: "the one that banks most, less what it leaves them",
    give: "the one that leaves them least",
    near: "the one nearest your store",
    far: "the one furthest from your store",
  }[r.pick];
  return ifs.length ? `If a move ${ifs.join(" and ")}: ${then}.` : `Otherwise: ${then}.`;
};

let left = positions;
const rules: Rule[] = [];
const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
while (rules.length < MAX_RULES && left.length > positions.length * 0.01) {
  let best: { rule: Rule; cover: number; right: number } | null = null;
  for (const rule of candidates) {
    if (rules.some((r) => JSON.stringify(r) === JSON.stringify(rule))) continue;
    let cover = 0, right = 0;
    for (const p of left) {
      const pit = pickBy(rule, p.facts);
      if (pit === null) continue;
      cover++;
      if (pit === p.target) right++;
    }
    if (cover < Math.max(50, MIN_SHARE * left.length)) continue;
    if (
      !best || right / cover > best.right / best.cover ||
      (right / cover === best.right / best.cover && cover > best.cover)
    ) {
      best = { rule, cover, right };
    }
  }
  if (!best) break;
  rules.push(best.rule);
  left = left.filter((p) => pickBy(best.rule, p.facts) === null);
}
// The catch-all: the way of choosing that best copies the net on what's left.
let fallback: Rule = { pick: "bank" }, fallbackRight = -1;
for (const pick of picks) {
  const right = left.filter((p) => pickBy({ pick }, p.facts) === p.target).length;
  if (right > fallbackRight) [fallback, fallbackRight] = [{ pick }, right];
}
rules.push(fallback);

// Report: each rule, on the positions it decides.
console.log(`${positions.length} positions; the net's moves, decompiled:\n`);
let rest = positions;
rules.forEach((rule, i) => {
  const decided = rest.filter((p) => pickBy(rule, p.facts) !== null);
  const right = decided.filter((p) => pickBy(rule, p.facts) === p.target).length;
  console.log(`${i + 1}. ${english(rule)}`);
  console.log(
    `   decides ${pct(decided.length, positions.length)} of positions, the net's move in ${pct(right, decided.length)}`,
  );
  rest = rest.filter((p) => !decided.includes(p));
});
const agree = positions.filter((p) => followRules(rules, p.facts) === p.target).length;
console.log(`\nThe list plays the net's move in ${pct(agree, positions.length)} of positions.`);

if (policyFile) {
  const rows = read(policyFile);
  const bestOf = (r: Row, pit: number) => pitsOf(r.toMove).indexOf(pit) === r.move;
  const rate = (pick: (s: GameState, f: MoveFacts[]) => number | null) =>
    pct(rows.filter((r) => bestOf(r, pick(state(r), factsOf(state(r), boards))!)).length, rows.length);
  console.log(`\nMinimax's move (depth 5), over ${rows.length} positions:`);
  console.log(`  the net ${rate((s) => net.choose(s))}, the rule list ${rate((_, f) => followRules(rules, f))}`);
  console.log(`  Greedy (the most banked) ${rate((_, f) => pickBy({ pick: "bank" }, f))}`);
}
writeFileSync("data/learn/rules.json", JSON.stringify(rules));
console.log(`\nexport const RULES: Rule[] = ${JSON.stringify(rules)};`);
