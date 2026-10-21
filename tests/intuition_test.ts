/** Intuition's policy net (src/bots/search/policy.ts), the Rule list's rules (search/rules.ts), and both bots. */
import { test } from "node:test";
import { assert, assertEquals } from "./assert.ts";
import { createBot, IntuitionBot, RuleListBot } from "../src/bots/bots.ts";
import { PolicyNet } from "../src/bots/search/policy.ts";
import { POLICY_WEIGHTS } from "../src/bots/search/policy-weights.ts";
import { factsOf, followRules, type MoveFacts, passes, pickBy, RULES } from "../src/bots/search/rules.ts";
import { newGame, other, playTurn, storeOf, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, P1, P2 } from "../src/game/types.ts";

const position = (pits: number[], current = P1): GameState => ({
  rules: { ...DEFAULT_RULES },
  pits,
  current,
  gameOver: false,
});

/** Positions from a game Greedy-ish play reaches: a varied handful to check facts on. */
function positions(): GameState[] {
  const out: GameState[] = [];
  let s = newGame(DEFAULT_RULES, P1);
  for (let ply = 0; ply < 60 && !s.gameOver; ply++) {
    out.push(s);
    const moves = validMoves(s);
    s = playTurn(s, moves[(ply * 5) % moves.length]).state;
  }
  return out;
}

test("the policy net reads a position the same from either side", () => {
  const net = new PolicyNet(POLICY_WEIGHTS);
  //                  0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
  const p1 = position([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 20, 23], P1);
  const p2 = position([8, 9, 0, 1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 23, 20], P2);
  assertEquals([...net.outputs(p1)], [...net.outputs(p2)]);
  assertEquals(net.choose(p2), net.choose(p1)! + 7, "the same pit, counted from the mover's side");
});

test("the policy net only names a pit with seeds, and none when there's nothing to play", () => {
  const net = new PolicyNet(POLICY_WEIGHTS);
  for (const s of positions()) assert(validMoves(s).includes(net.choose(s)!));
  //                       0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
  const one = position([0, 0, 0, 5, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 40, 46]);
  assertEquals(net.choose(one), 3, "the only pit with seeds");
  assertEquals(net.choose({ ...one, gameOver: true }), null);
  assertEquals(net.choose(position([0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 45, 46])), null);
});

test("a move's facts match what playTurn says it does", () => {
  for (const s of positions()) {
    const me = s.current;
    for (const f of factsOf(s)) {
      const r = playTurn(s, f.pit);
      assert(!r.invalid);
      assertEquals(f.bank, r.state.pits[storeOf(me)] - s.pits[storeOf(me)], `pit ${f.pit}: bank`);
      assertEquals(f.free, r.freeTurn && !r.state.gameOver, `pit ${f.pit}: free`);
      const them = other(me);
      const give = r.state.gameOver || r.state.current === me ? 0 : Math.max(
        0,
        ...validMoves(r.state).map((m) => playTurn(r.state, m).state.pits[storeOf(them)] - r.state.pits[storeOf(them)]),
      );
      assertEquals(f.give, give, `pit ${f.pit}: give`);
      assertEquals(f.place, (me === P1 ? f.pit : f.pit - 7) + 1);
    }
  }
});

test("a move that clinches the majority wins the game now", () => {
  //                         0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
  const s = position([0, 0, 0, 0, 0, 2, 1, 4, 4, 4, 4, 4, 4, 4, 49, 18]);
  const facts = factsOf(s);
  const last = facts.find((f) => f.pit === 6)!;
  assert(last.wins && !last.free, "banking the 50th seed ends the game; no free turn after it");
  assertEquals(last.give, 0);
  assertEquals(pickBy({ wins: true, pick: "near" }, facts), 6);
});

const fact = (pit: number, bank: number, give: number, more: Partial<MoveFacts> = {}): MoveFacts => ({
  pit,
  place: pit + 1,
  wins: false,
  free: false,
  bank,
  give,
  ...more,
});

test("each condition keeps only the moves that pass it", () => {
  const f = fact(2, 3, 1);
  assert(passes({ pick: "bank" }, f));
  assert(!passes({ wins: true, pick: "bank" }, f));
  assert(passes({ wins: true, pick: "bank" }, { ...f, wins: true }));
  assert(!passes({ free: true, pick: "bank" }, f));
  assert(passes({ free: true, pick: "bank" }, { ...f, free: true }));
  assert(passes({ minBank: 3, pick: "bank" }, f) && !passes({ minBank: 4, pick: "bank" }, f));
  assert(passes({ maxGive: 1, pick: "bank" }, f) && !passes({ maxGive: 0, pick: "bank" }, f));
  assert(passes({ minNet: 2, pick: "bank" }, f) && !passes({ minNet: 3, pick: "bank" }, f));
});

test("each way of choosing picks its move, ties going to the pit nearest the store", () => {
  const facts = [fact(0, 5, 6), fact(1, 3, 0), fact(4, 2, 0), fact(6, 5, 4)];
  assertEquals(pickBy({ pick: "bank" }, facts), 6, "5 banked twice: the nearer one");
  assertEquals(pickBy({ pick: "net" }, facts), 1, "3 less 0");
  assertEquals(pickBy({ pick: "give" }, facts), 4, "nothing given twice: the nearer one");
  assertEquals(pickBy({ pick: "near" }, facts), 6);
  assertEquals(pickBy({ pick: "far" }, facts), 0);
  assertEquals(pickBy({ free: true, pick: "bank" }, facts), null, "no move passes");
});

test("the first rule that applies decides; with none, there's no move", () => {
  const facts = [fact(0, 1, 0), fact(3, 0, 0, { free: true })];
  assertEquals(followRules([{ wins: true, pick: "bank" }, { free: true, pick: "bank" }, { pick: "far" }], facts), 3);
  assertEquals(followRules([{ wins: true, pick: "bank" }, { pick: "far" }], facts), 0);
  assertEquals(followRules([{ wins: true, pick: "bank" }], facts), null);
  assertEquals(
    RULES.at(-1)!.wins ?? RULES.at(-1)!.free ?? RULES.at(-1)!.minBank,
    undefined,
    "the last rule takes any move",
  );
});

test("Intuition and Rule list play legal moves through a whole game", () => {
  for (const id of ["intuition", "ruleList"] as const) {
    const bot = createBot(id);
    assert(bot instanceof (id === "intuition" ? IntuitionBot : RuleListBot));
    let s = newGame(DEFAULT_RULES, P2);
    for (let ply = 0; ply < 300 && !s.gameOver; ply++) {
      const move = bot.choose(s);
      assert(move !== null && validMoves(s).includes(move), `${id}, ply ${ply}: ${move}`);
      s = playTurn(s, move).state;
      // Random replies, seeded by the ply, so the bot meets varied positions.
      if (!s.gameOver && s.current === P1) s = playTurn(s, validMoves(s)[(ply * 3) % validMoves(s).length]).state;
    }
    assert(s.gameOver, `${id}: the game finishes`);
  }
});
