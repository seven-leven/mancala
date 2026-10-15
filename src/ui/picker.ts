/**
 * The opponent picker: a pill button that opens a list of opponents, grouped into strength bands.
 * Each bot shows its everyday level, its algorithm, its Elo and a bar for where that sits on the
 * ladder. It follows the ARIA listbox pattern: arrow keys, Home and End, type-ahead, Enter or Space
 * to choose, Escape to close.
 */

export interface PickerItem {
  value: string;
  /** "Expert": what most players read. */
  title: string;
  /** "Minimax": the algorithm, shown muted. */
  detail?: string;
  /** Elo, if rated. */
  elo?: number;
  /** A word on the right instead of an Elo ("2 players"). */
  note?: string;
}

export interface PickerGroup {
  /** "Strong". No label: the items sit above the bands, before a rule. */
  label?: string;
  /** "1600+". */
  range?: string;
  items: PickerItem[];
}

let nextId = 0;

export class Picker {
  readonly root: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly options = new Map<string, HTMLElement>();
  private readonly items = new Map<string, PickerItem>();
  private readonly order: string[] = [];
  private current = "";
  private active = "";
  private typed = "";
  private typedAt = 0;
  private readonly onChange: (value: string) => void;

  constructor(root: HTMLElement, label: string, groups: PickerGroup[], onChange: (value: string) => void) {
    this.root = root;
    this.onChange = onChange;
    const id = `picker${nextId++}`;
    root.classList.add("picker");

    const name = el("span", "visually-hidden", label);
    name.id = `${id}-label`;
    this.button = Object.assign(document.createElement("button"), { type: "button", className: "picker__button" });
    this.button.id = `${id}-button`;
    this.button.setAttribute("aria-haspopup", "listbox");
    this.button.setAttribute("aria-expanded", "false");
    this.button.setAttribute("aria-labelledby", `${name.id} ${this.button.id}`);

    this.list = el("div", "picker__list");
    this.list.id = `${id}-list`;
    this.list.tabIndex = -1;
    this.list.hidden = true;
    this.list.setAttribute("role", "listbox");
    this.list.setAttribute("aria-labelledby", name.id);
    this.button.setAttribute("aria-controls", this.list.id);

    const top = Math.max(...groups.flatMap((g) => g.items.map((i) => i.elo ?? 0)));
    const bottom = Math.min(...groups.flatMap((g) => g.items.filter((i) => i.elo).map((i) => i.elo!)));
    for (const [g, group] of groups.entries()) {
      const box = el("div", "picker__group");
      box.setAttribute("role", "group");
      if (group.label) {
        const head = el("div", "picker__head");
        head.id = `${id}-g${g}`;
        head.append(el("span", "label", group.label), el("span", "mono", group.range ?? ""));
        head.setAttribute("aria-hidden", "true");
        box.setAttribute("aria-label", group.label);
        box.append(head);
      }
      for (const item of group.items) {
        const option = el("div", "picker__option");
        option.id = `${id}-${item.value}`;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        option.dataset.value = item.value;
        option.append(el("span", "picker__title", item.title), el("span", "picker__detail", item.detail ?? ""));
        if (item.elo) {
          const bar = el("span", "picker__bar");
          // Leave a sliver for the weakest so every bot shows a bar.
          bar.style.setProperty("--fill", String(0.06 + 0.94 * (item.elo - bottom) / Math.max(1, top - bottom)));
          option.append(el("span", "picker__elo mono", String(item.elo)), bar);
          option.setAttribute("aria-label", `${item.title}, ${item.detail}, rated ${item.elo}`);
        } else {
          option.append(el("span", "picker__note", item.note ?? ""));
          option.classList.add("picker__option--plain");
        }
        this.options.set(item.value, option);
        this.items.set(item.value, item);
        this.order.push(item.value);
        box.append(option);
      }
      this.list.append(box);
    }
    root.append(name, this.button, this.list);

    this.button.addEventListener("click", () => (this.list.hidden ? this.open() : this.close()));
    this.button.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this.open();
      }
    });
    this.list.addEventListener("keydown", (e) => this.key(e));
    this.list.addEventListener("pointermove", (e) => {
      const option = (e.target as HTMLElement).closest<HTMLElement>("[role=option]");
      if (option) this.highlight(option.dataset.value!, false);
    });
    this.list.addEventListener("click", (e) => {
      const option = (e.target as HTMLElement).closest<HTMLElement>("[role=option]");
      if (option) this.choose(option.dataset.value!);
    });
    this.list.addEventListener("focusout", (e) => {
      if (!root.contains(e.relatedTarget as Node | null)) this.close(false);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!this.list.hidden && !root.contains(e.target as Node)) this.close(false);
    });
    globalThis.addEventListener("resize", () => this.close(false));
  }

  get value(): string {
    return this.current;
  }

  /** Shows a value without telling anyone: for settings loaded or changed elsewhere. */
  set value(value: string) {
    const item = this.items.get(value);
    if (!item) return;
    this.options.get(this.current)?.setAttribute("aria-selected", "false");
    this.options.get(value)!.setAttribute("aria-selected", "true");
    this.current = value;
    this.button.replaceChildren(
      el("span", "picker__title", item.title),
      ...(item.detail ? [el("span", "picker__detail", item.detail)] : []),
      ...(item.elo ? [el("span", "picker__elo mono", String(item.elo))] : []),
    );
  }

  private open(): void {
    this.list.hidden = false;
    this.button.setAttribute("aria-expanded", "true");
    // Open under the button, slid left as far as it takes to stay on screen.
    this.list.style.left = "0px";
    const box = this.list.getBoundingClientRect();
    const room = document.documentElement.clientWidth - 16;
    this.list.style.left = `${Math.max(16 - box.left, Math.min(0, room - box.right))}px`;
    this.highlight(this.current || this.order[0]);
    this.list.focus({ preventScroll: true });
  }

  private close(refocus = true): void {
    if (this.list.hidden) return;
    this.list.hidden = true;
    this.button.setAttribute("aria-expanded", "false");
    this.list.removeAttribute("aria-activedescendant");
    if (refocus) this.button.focus();
  }

  private choose(value: string): void {
    const changed = value !== this.current;
    this.value = value;
    this.close();
    if (changed) this.onChange(value);
  }

  private highlight(value: string, scroll = true): void {
    this.options.get(this.active)?.classList.remove("is-active");
    this.active = value;
    const option = this.options.get(value)!;
    option.classList.add("is-active");
    this.list.setAttribute("aria-activedescendant", option.id);
    if (scroll) option.scrollIntoView({ block: "nearest" });
  }

  private key(e: KeyboardEvent): void {
    const i = this.order.indexOf(this.active);
    const go = (j: number) => this.highlight(this.order[Math.max(0, Math.min(this.order.length - 1, j))]);
    switch (e.key) {
      case "ArrowDown":
        go(i + 1);
        break;
      case "ArrowUp":
        go(i - 1);
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(this.order.length - 1);
        break;
      case "PageDown":
        go(i + 5);
        break;
      case "PageUp":
        go(i - 5);
        break;
      case "Enter":
      case " ":
        this.choose(this.active);
        break;
      case "Escape":
        this.close();
        break;
      case "Tab":
        this.close(false);
        return;
      default: {
        // Type-ahead on the level name ("ex" finds Expert).
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
        const now = performance.now();
        this.typed = (now - this.typedAt < 700 ? this.typed : "") + e.key.toLowerCase();
        this.typedAt = now;
        const from = this.typed.length === 1 ? i + 1 : i;
        const match = [...this.order.slice(from), ...this.order.slice(0, from)]
          .find((v) => this.items.get(v)!.title.toLowerCase().startsWith(this.typed));
        if (match) this.highlight(match);
      }
    }
    e.preventDefault();
    e.stopPropagation();
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
