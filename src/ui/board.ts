/**
 * The board on screen: two rows of pits (buttons) between the two stores. It only draws what
 * it's told; the rules live in the engine and the turn flow in the controller.
 */
import { M1, M2, P1_PITS, P2_PITS, type Player } from "../game/types.ts";

const MAX_SEEDS_PIT = 24;
const MAX_SEEDS_STORE = 60;

/** A seed's diameter, as a share of its cup: smaller as the cup fills. */
const seedSize = (shown: number) => Math.min(30, 62 / Math.sqrt(shown + 1));

/** Seeds laid out as a sunflower spiral, so any count packs evenly into a round cup. */
export function seedsHtml(count: number, max: number): string {
  const shown = Math.min(count, max);
  let out = "";
  // A few seeds sit together in the middle; a full cup spreads out to its edge.
  const spread = 0.42 * Math.min(1, Math.sqrt(shown / 7));
  for (let k = 0; k < shown; k++) {
    const r = Math.sqrt((k + 0.5) / shown) * spread;
    const a = k * 2.39996; // the golden angle
    out += `<i class="seed" style="left:${(50 + r * Math.cos(a) * 100).toFixed(1)}%;top:${
      (50 + r * Math.sin(a) * 100).toFixed(1)
    }%"></i>`;
  }
  return out;
}

/** A pit's number from its owner's point of view: 1 is the owner's leftmost pit. */
export const pitNumber = (pit: number): number => (pit <= 6 ? pit + 1 : 14 - pit);

export class BoardView {
  readonly el: HTMLElement;
  private cups = new Map<number, { el: HTMLElement; seeds: HTMLElement; count: HTMLElement }>();

  constructor(el: HTMLElement) {
    this.el = el;
    const store = (player: Player) => `
      <div class="store store--${player}" data-player="${player}" id="store${player}">
        <span class="store__label label" id="storeLabel${player}">Player ${player}</span>
        <span class="seeds"></span>
        <span class="store__count">0</span>
      </div>`;
    const row = (pits: readonly number[], player: Player) =>
      `<div class="row">${
        pits.map((i) =>
          `<button type="button" class="pit" id="pit${i}" data-pit="${i}" data-player="${player}">` +
          `<span class="seeds"></span><span class="pit__count">0</span></button>`
        ).join("")
      }</div>`;
    // The top row reads 7..13 left to right, so seeds go right to left along it toward Player 2's
    // store on the left: one loop round the board with the bottom row.
    el.innerHTML = store(2) + `<div class="rows">${row(P2_PITS, 2)}${row(P1_PITS, 1)}</div>` + store(1);

    for (const i of [...P1_PITS, ...P2_PITS]) {
      const pit = el.querySelector<HTMLElement>(`#pit${i}`)!;
      this.cups.set(i, {
        el: pit,
        seeds: pit.querySelector(".seeds")!,
        count: pit.querySelector(".pit__count")!,
      });
    }
    for (const [i, p] of [[M1, 1], [M2, 2]] as const) {
      const store = el.querySelector<HTMLElement>(`#store${p}`)!;
      this.cups.set(i, {
        el: store,
        seeds: store.querySelector(".seeds")!,
        count: store.querySelector(".store__count")!,
      });
    }
  }

  onPit(handler: (pit: number) => void): void {
    this.el.addEventListener("click", (e) => {
      const pit = (e.target as HTMLElement).closest<HTMLElement>("[data-pit]");
      if (pit) handler(Number(pit.dataset.pit));
    });
  }

  /** Draws every pit and store. */
  render(pits: readonly number[]): void {
    for (let i = 0; i < 16; i++) this.setCount(i, pits[i]);
  }

  /** One pit's seeds and count; `pulse` for a seed landing. */
  setCount(i: number, n: number, pulse = false): void {
    const cup = this.cups.get(i)!;
    const max = i === M1 || i === M2 ? MAX_SEEDS_STORE : MAX_SEEDS_PIT;
    cup.seeds.style.setProperty("--seed-size", `${seedSize(Math.min(n, max))}%`);
    cup.seeds.innerHTML = seedsHtml(n, max);
    cup.count.textContent = String(n);
    cup.count.classList.toggle("is-empty", n === 0);
    if (pulse) {
      cup.count.classList.remove("is-pulse");
      void cup.count.offsetWidth; // restart the animation
      cup.count.classList.add("is-pulse");
    }
  }

  /** Whose turn it is (dims the other side), or null when no one is to move. */
  setTurn(player: Player | null): void {
    if (player) this.el.dataset.turn = String(player);
    else delete this.el.dataset.turn;
  }

  /** Which pits can be played right now, and how each pit reads to a screen reader. */
  setPlayable(playable: ReadonlySet<number>, label: (pit: number, seeds: number) => string, pits: readonly number[]) {
    for (const i of [...P1_PITS, ...P2_PITS]) {
      const el = this.cups.get(i)!.el as HTMLButtonElement;
      const can = playable.has(i);
      el.classList.toggle("is-selectable", can);
      el.disabled = !can;
      el.setAttribute("aria-label", label(i, pits[i]));
    }
  }

  setStoreLabels(names: { 1: string; 2: string }): void {
    for (const p of [1, 2] as const) this.el.querySelector(`#storeLabel${p}`)!.textContent = names[p];
  }

  /** Marks the pit a move is sowing from (null to clear). */
  sowingFrom(pit: number | null): void {
    for (const [i, cup] of this.cups) cup.el.classList.toggle("is-sowing", i === pit);
  }

  hint(pit: number | null): void {
    for (const [i, cup] of this.cups) cup.el.classList.toggle("is-hint", i === pit);
  }

  flashCapture(pits: number[], ms: number): void {
    const els = pits.map((i) => this.cups.get(i)!.el);
    for (const el of els) el.classList.add("is-capture");
    setTimeout(() => els.forEach((el) => el.classList.remove("is-capture")), ms);
  }

  focusPit(pit: number): void {
    this.cups.get(pit)?.el.focus();
  }
}
