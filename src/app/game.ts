/**
 * Runs a game on screen: takes a move (a click, a key, or a bot), has the engine play it,
 * replays the engine's events as animation, then adopts the new state and decides what's next.
 * It holds no rules of its own.
 */
import { BOTS, type Seat } from "../bots/bots.ts";
import { askBot } from "../bots/client.ts";
import { newGame, playTurn, score, validMoves, winnerOf } from "../game/engine.ts";
import type { GameState, Player, TurnEvent, TurnResult } from "../game/types.ts";
import { BoardView, pitNumber } from "../ui/board.ts";
import { sound } from "../ui/sound.ts";
import { recordGame, type SavedGame } from "./history.ts";
import { DROP_MS, type Settings } from "./settings.ts";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A beat before a bot moves, so you can follow it. */
const BOT_PAUSE_MS = 450;
const CAPTURE_PAUSE_MS = 200;
/** Moves longer than this many drops are sped up to fit about this long. */
const LONG_MOVE_DROPS = 30;
const MIN_DROP_MS = 25;

/** The page around the board. */
export interface Chrome {
  turn: HTMLElement;
  turnText: HTMLElement;
  turnNote: HTMLElement;
  score: { 1: HTMLElement; 2: HTMLElement };
  name: { 1: HTMLElement; 2: HTMLElement };
  hand: HTMLElement;
  toast: HTMLElement;
  log: HTMLOListElement;
  moveCount: HTMLElement;
  undo: HTMLButtonElement;
  hint: HTMLButtonElement;
  skip: HTMLButtonElement;
  replay: HTMLButtonElement;
}

interface LogEntry {
  player: Player;
  text: string;
}

export class Game {
  state: GameState;
  /** Bumped by a new game or an undo, so a move or search still running from before stops. */
  private gen = 0;
  /** A move is animating or a bot is thinking. */
  private busy = false;
  private thinking = false;
  private skip = false;
  private undoStack: { state: GameState; logLength: number; moveCount: number }[] = [];
  private log: LogEntry[] = [];
  /** The game so far, for Replay: where it started and every pit played since. */
  private opening!: GameState;
  private moves: number[] = [];
  private replaying = false;
  /** Who sat where when this game began, and anything that keeps it from being rated. */
  private seatsAtStart: Settings["seats"] = { 1: "human", 2: "human" };
  private unrated: string | null = null;
  /** Called with each finished game once it's saved (to update the stats). */
  onGameSaved: (game: SavedGame) => void = () => {};

  constructor(private board: BoardView, private ui: Chrome, public settings: Settings) {
    this.state = newGame(settings.rules);
    board.onPit((pit) => this.humanMove(pit));
  }

  // --- Who's who -----------------------------------------------------------------------

  seat(p: Player): Seat {
    return this.settings.seats[p];
  }

  /** "You" when exactly one side is human; otherwise "Player 1", or the bot's name. */
  name(p: Player): string {
    const seat = this.seat(p);
    if (seat !== "human") {
      const same = this.seat(p === 1 ? 2 : 1) === seat;
      return `${BOTS[seat].level} bot${same ? ` ${p}` : ""}`;
    }
    const humans = (["human", "human"] as const).filter((_, i) => this.seat((i + 1) as Player) === "human").length;
    return humans === 1 ? "You" : `Player ${p}`;
  }

  private isHumanTurn(): boolean {
    return !this.state.gameOver && this.seat(this.state.current) === "human";
  }

  // --- Commands --------------------------------------------------------------------------

  start(): void {
    this.gen++;
    this.busy =
      this.thinking =
      this.skip =
      this.replaying =
        false;
    const { first, rules } = this.settings;
    this.state = this.opening = first === "random" ? newGame(rules) : newGame(rules, Number(first) as Player);
    this.moves = [];
    this.seatsAtStart = { ...this.settings.seats };
    this.unrated = null;
    this.undoStack = [];
    this.log = [];
    this.board.hint(null);
    this.board.sowingFrom(null);
    this.render();
    const opener = this.name(this.state.current);
    this.say(opener === "You" ? "You go first." : `${opener} goes first.`);
    void this.advance();
  }

  /** Plays pit `pit` for the human whose turn it is. */
  async humanMove(pit: number): Promise<void> {
    if (this.busy || this.replaying || !this.isHumanTurn() || !validMoves(this.state).includes(pit)) return;
    this.undoStack.push({ state: this.state, logLength: this.log.length, moveCount: this.moves.length });
    this.skip = false;
    const gen = this.gen;
    await this.play(pit, gen);
    if (gen !== this.gen) return;
    await this.advance();
  }

  /** Plays the human's pit numbered `n` (1–7) from their own left. */
  playKey(n: number): void {
    if (!this.isHumanTurn()) return;
    void this.humanMove(this.state.current === 1 ? n - 1 : 14 - n);
  }

  /** Takes back the last human move, and any bot replies since. */
  undo(): void {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.gen++;
    this.busy = this.thinking = this.skip = false;
    this.state = snap.state;
    this.log.length = snap.logLength;
    this.unrated = "Undo was used";
    this.moves.length = snap.moveCount;
    this.board.hint(null);
    this.board.sowingFrom(null);
    this.render();
    this.say("Took that move back.");
  }

  /** Plays the finished game again from the start (bots don't move; the recorded pits do). */
  async replay(): Promise<void> {
    if (this.busy || this.replaying || !this.state.gameOver || this.moves.length === 0) return;
    const moves = [...this.moves];
    const gen = ++this.gen;
    this.replaying = true;
    this.skip = false;
    this.state = this.opening;
    this.moves = [];
    this.log = [];
    this.undoStack = [];
    this.board.hint(null);
    this.render();
    this.say("Replaying the game.");
    for (const move of moves) {
      await this.play(move, gen);
      if (gen !== this.gen) return;
    }
    this.replaying = false;
    this.render();
  }

  async hint(): Promise<void> {
    if (this.busy || this.replaying || !this.isHumanTurn()) return;
    const { gen, state } = this;
    this.ui.hint.disabled = true;
    this.say("Looking for a good move…");
    const { move } = await askBot("minimax", state, 500);
    if (gen !== this.gen || state !== this.state || move === null) return;
    this.unrated ??= "a Hint was used";
    this.board.hint(move);
    this.ui.hint.disabled = false;
    this.say(`Try pit ${pitNumber(move)}.`);
  }

  /** Fast-forwards until a person has to move again. */
  skipAhead(): void {
    if (this.busy) this.skip = true;
  }

  /** Seats or speed changed: carry on with the same game. */
  settingsChanged(): void {
    const { seats } = this.settings;
    if (seats[1] !== this.seatsAtStart[1] || seats[2] !== this.seatsAtStart[2]) {
      this.unrated ??= "the players changed midway";
    }
    this.render();
    if (!this.busy) void this.advance();
  }

  // --- The turn loop ---------------------------------------------------------------------

  /** Lets the bots play for as long as it's a bot's turn. */
  private async advance(): Promise<void> {
    const gen = this.gen;
    while (!this.state.gameOver) {
      const seat = this.seat(this.state.current);
      if (seat === "human") break;
      this.busy = this.thinking = true;
      this.render();
      const [{ move, note }] = await Promise.all([askBot(seat, this.state), this.skip ? 0 : wait(BOT_PAUSE_MS)]);
      if (gen !== this.gen) return;
      this.thinking = false;
      // The seats may have changed while it thought.
      if (move === null || this.seat(this.state.current) !== seat) break;
      await this.play(move, gen, note);
      if (gen !== this.gen) return;
    }
    this.busy = this.thinking = false;
    this.render();
  }

  private async play(move: number, gen: number, note: string | null = null): Promise<void> {
    const r = playTurn(this.state, move);
    if (r.invalid) return;
    this.busy = true;
    this.board.hint(null);
    this.render();
    await this.animate(r.events, gen);
    if (gen !== this.gen) return;
    this.state = r.state;
    this.moves.push(move);
    this.board.sowingFrom(null);
    this.record(r, note);
    this.busy = false;
    this.render();
  }

  private async animate(events: TurnEvent[], gen: number): Promise<void> {
    // Long relays speed up: a move never takes much longer than LONG_MOVE_DROPS seeds would.
    const drops = events.filter((e) => e.type === "drop").length;
    const base = reduceMotion ? DROP_MS.fast : DROP_MS[this.settings.speed];
    const dropMs = Math.max(MIN_DROP_MS, base * Math.min(1, LONG_MOVE_DROPS / drops));
    for (const e of events) {
      if (gen !== this.gen) return;
      switch (e.type) {
        case "pickup":
          this.board.sowingFrom(e.pit);
          this.board.setCount(e.pit, 0);
          this.ui.hand.textContent = String(e.count);
          break;
        case "drop":
          this.board.setCount(e.pit, e.count, !this.skip && !reduceMotion);
          if (!this.skip) sound.drop(e.pit);
          this.ui.hand.textContent = String(e.inHand);
          if (!this.skip) await wait(dropMs);
          break;
        case "capture":
          if (!this.skip) await wait(CAPTURE_PAUSE_MS);
          this.board.flashCapture([e.landing, e.opposite, e.store], 700);
          if (!this.skip) sound.capture();
          this.board.setCount(e.opposite, 0);
          this.board.setCount(e.store, e.storeCount, true);
          break;
        case "sweep":
          for (let i = 0; i <= 13; i++) this.board.setCount(i, 0);
          this.board.setCount(14, e.m1, true);
          this.board.setCount(15, e.m2, true);
          break;
      }
    }
  }

  /** Logs the move and says what happened. */
  private record(r: Extract<TurnResult, { invalid: false }>, note: string | null): void {
    const who = this.name(r.player);
    const parts = [`pit ${pitNumber(r.move)}`];
    if (r.relays) parts.push(`relay ×${r.relays}`);
    if (r.captured) parts.push(`captured ${r.captured}`);
    if (r.freeTurn) parts.push("free turn");
    if (note) parts.push(note);
    this.log.push({ player: r.player, text: `${who} · ${parts.join(" · ")}` });

    if (r.gameOver) sound.gameOver();
    else if (r.freeTurn && !this.skip) sound.freeTurn();
    if (r.gameOver) this.say(`Game over. ${this.result()}.`);
    else if (r.captured) this.say(`Capture! ${r.captured} seeds.`);
    else if (r.freeTurn) this.say(who === "You" ? "Free turn: play again." : `Free turn: ${who} plays again.`);
    else this.say("");
    if (r.gameOver && !this.replaying) this.save();
  }

  private save(): void {
    const game = recordGame({
      seats: { ...this.settings.seats },
      rules: this.settings.rules,
      first: this.opening.current,
      score: [score(this.state, 1), score(this.state, 2)],
      winner: winnerOf(this.state),
      moves: [...this.moves],
    }, this.unrated);
    this.onGameSaved(game);
  }

  private result(): string {
    const a = score(this.state, 1), b = score(this.state, 2);
    if (a === b) return `A draw, ${a}–${b}`;
    const w: Player = a > b ? 1 : 2;
    const who = this.name(w);
    return `${who} ${who === "You" ? "win" : "wins"}, ${Math.max(a, b)}–${Math.min(a, b)}`;
  }

  // --- Drawing ---------------------------------------------------------------------------

  private say(text: string): void {
    this.ui.toast.textContent = text;
  }

  /** Redraws everything from the current state (never during an animation's steps). */
  private render(): void {
    const { state, ui, board } = this;
    const animating = this.busy && !this.thinking;
    if (!animating) {
      board.render(state.pits);
      ui.hand.textContent = "0";
    }
    board.setTurn(state.gameOver ? null : state.current);
    board.setStoreLabels({ 1: this.name(1), 2: this.name(2) });

    const canPlay = !this.busy && !this.replaying && this.isHumanTurn();
    const playable = new Set(canPlay ? validMoves(state) : []);
    board.setPlayable(playable, (pit, n) => {
      const owner: Player = pit <= 6 ? 1 : 2;
      const who = this.name(owner);
      return `${who === "You" ? "Your" : `${who}'s`} pit ${pitNumber(pit)}, ${n} ${n === 1 ? "seed" : "seeds"}`;
    }, state.pits);

    for (const p of [1, 2] as const) {
      ui.score[p].textContent = String(score(state, p));
      ui.name[p].textContent = this.name(p);
    }

    // The turn line
    const current = state.current;
    if (state.gameOver) {
      const a = score(state, 1), b = score(state, 2);
      ui.turn.dataset.player = a === b ? "" : String(a > b ? 1 : 2);
      ui.turnText.textContent = this.result();
      ui.turnNote.textContent = "";
    } else {
      ui.turn.dataset.player = String(current);
      const who = this.name(current);
      if (this.seat(current) !== "human") {
        ui.turnText.textContent = this.thinking ? `${who} is thinking` : `${who} to play`;
        ui.turnNote.textContent = this.replaying ? "replay" : animating ? "sowing…" : "";
      } else {
        ui.turnText.textContent = who === "You" ? "Your turn" : `${who}'s turn`;
        ui.turnNote.textContent = this.replaying
          ? "replay"
          : animating
          ? "sowing…"
          : who === "You"
          ? "pick one of your pits"
          : `the ${current === 1 ? "bottom" : "top"} row`;
      }
    }

    ui.undo.disabled = this.undoStack.length === 0 || (animating && !this.skip);
    ui.hint.disabled = !canPlay;
    ui.skip.disabled = !this.busy;
    ui.replay.hidden = !state.gameOver || this.replaying || this.moves.length === 0;

    // The move log, newest first
    ui.moveCount.textContent = this.log.length ? `· ${this.log.length}` : "";
    ui.log.replaceChildren(
      ...this.log.toReversed().map(({ player, text }) => {
        const li = document.createElement("li");
        li.dataset.player = String(player);
        li.textContent = text;
        return li;
      }),
    );
  }
}
