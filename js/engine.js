// --- Constants & Helpers ---
export const P1 = 1;
export const P2 = 2;
export const SMALL_PITS = [...Array(14).keys()];
export const P1_PITS = [0, 1, 2, 3, 4, 5, 6];
export const P2_PITS = [7, 8, 9, 10, 11, 12, 13];
export const M1 = 14;
export const M2 = 15;
const ORDER = [0, 1, 2, 3, 4, 5, 6, 14, 13, 12, 11, 10, 9, 8, 7, 15];
const NEXT = new Map(ORDER.map((v, i) => [v, ORDER[(i + 1) % ORDER.length]]));
export const isSmallPit = (i) => i >= 0 && i <= 13;
export const isOwnSmallPit = (player, i) =>
  isSmallPit(i) &&
  ((player === P1 && P1_PITS.includes(i)) ||
    (player === P2 && P2_PITS.includes(i)));
export const oppositeOf = (i) => {
  if (i >= 0 && i <= 6) return i + 7;
  if (i >= 7 && i <= 13) return i - 7;
  return null;
};
export const wait = (ms) => new Promise((res) => setTimeout(res, ms));

// --- Game Engine ---
export class MancalaEngine {
  constructor(stonesPerPit = 7) {
    this.initialStones = stonesPerPit;
    this.reset();
  }
  reset() {
    this.pits = new Array(16).fill(0);
    for (let i = 0; i < 14; i++) this.pits[i] = this.initialStones;
    this.pits[M1] = 0;
    this.pits[M2] = 0;
    this.current = Math.random() < 0.5 ? P1 : P2;
    this.gameOver = false;
  }
  clone() {
    const e = new MancalaEngine(this.initialStones);
    e.pits = [...this.pits];
    e.current = this.current;
    e.gameOver = this.gameOver;
    return e;
  }
  storeOf(p) {
    return p === P1 ? M1 : M2;
  }
  oppStoreOf(p) {
    return p === P1 ? M2 : M1;
  }
  validMoves(p = this.current) {
    const pits = p === P1 ? P1_PITS : P2_PITS;
    return pits.filter((i) => this.pits[i] > 0);
  }
  async performMove(startIndex, ui) {
    let inHand = this.pits[startIndex];
    this.pits[startIndex] = 0;
    ui?.pickup(startIndex, inHand);
    let pos = NEXT.get(startIndex);
    while (inHand > 0) {
      if (pos === this.oppStoreOf(this.current)) {
        pos = NEXT.get(pos);
        continue;
      }
      this.pits[pos]++;
      inHand--;
      ui?.drop(pos, this.pits[pos], inHand);
      if (ui) await wait(220);
      if (inHand > 0) pos = NEXT.get(pos);
    }
    return pos;
  }
  async playTurn(startIndex, ui) {
    if (
      this.gameOver || !isOwnSmallPit(this.current, startIndex) ||
      this.pits[startIndex] === 0
    ) {
      return { invalid: true };
    }
    let last = await this.performMove(startIndex, ui);
    while (isSmallPit(last) && this.pits[last] > 1) {
      last = await this.performMove(last, ui);
    }
    if (last === this.storeOf(this.current)) {
      this.checkGameOver();
      return { freeTurn: true };
    }
    if (isSmallPit(last) && this.pits[last] === 1) {
      const opp = oppositeOf(last);
      const captured = this.pits[opp];
      if (captured > 0) {
        this.pits[opp] = 0;
        this.pits[this.storeOf(this.current)] += captured + 1;
        this.pits[last] = 0;
        ui?.capture(last, opp, captured + 1, this.storeOf(this.current));
      }
    }
    this.checkGameOver(ui);
    return { endTurn: true };
  }
  simulateTurn(startIndex) {
    if (
      this.gameOver || !isOwnSmallPit(this.current, startIndex) ||
      this.pits[startIndex] === 0
    ) {
      return { invalid: true };
    }
    const _sowSync = (start) => {
      let inHand = this.pits[start];
      this.pits[start] = 0;
      let pos = NEXT.get(start);
      while (inHand > 0) {
        if (pos === this.oppStoreOf(this.current)) {
          pos = NEXT.get(pos);
          continue;
        }
        this.pits[pos]++;
        inHand--;
        if (inHand > 0) pos = NEXT.get(pos);
      }
      return pos;
    };
    let last = _sowSync(startIndex);
    while (isSmallPit(last) && this.pits[last] > 1) {
      last = _sowSync(last);
    }
    if (last === this.storeOf(this.current)) {
      this.checkGameOver();
      return { freeTurn: true };
    }
    if (isSmallPit(last) && this.pits[last] === 1) {
      const opp = oppositeOf(last);
      const captured = this.pits[opp];
      if (captured > 0) {
        this.pits[opp] = 0;
        this.pits[this.storeOf(this.current)] += captured + 1;
        this.pits[last] = 0;
      }
    }
    this.checkGameOver();
    return { endTurn: true };
  }
  checkGameOver(ui) {
    if (this.gameOver) return;
    const p1Empty = P1_PITS.every((i) => this.pits[i] === 0);
    const p2Empty = P2_PITS.every((i) => this.pits[i] === 0);
    if (p1Empty || p2Empty) {
      const p1Remain = P1_PITS.reduce((a, i) => a + this.pits[i], 0);
      const p2Remain = P2_PITS.reduce((a, i) => a + this.pits[i], 0);
      for (const i of P1_PITS) this.pits[i] = 0;
      for (const i of P2_PITS) this.pits[i] = 0;
      this.pits[M1] += p1Remain;
      this.pits[M2] += p2Remain;
      ui?.sweep(p1Remain, p2Remain);
      this.gameOver = true;
    }
  }
}
