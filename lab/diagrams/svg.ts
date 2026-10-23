/**
 * What the diagrams in docs/images/ share: the design guide's colours (docs/DESIGN.md) for the
 * light and dark themes, text, boxes and arrows, and the page wrapper. Each diagram is a file here
 * that draws itself in a theme; main.ts writes them all.
 */

/** "auto" follows the reader's light or dark setting (the SVGs in the docs); the PNGs are drawn in each. */
export type Theme = "auto" | "light" | "dark";

export interface Diagram {
  /** The file name in docs/images/, without the extension. */
  name: string;
  /** Also drawn as a light and a dark PNG (name.png, name-dark.png). */
  png: boolean;
  draw(theme: Theme): { svg: string; width: number; height: number };
}

const LIGHT = {
  ink: "#161514",
  muted: "#6b6760",
  rule: "#dfdad0",
  strong: "#cbc4b6",
  accent: "#a8483f",
  bg: "#f6f4ef",
  surface: "#fffdf9",
  tint: "#f3e6e1",
};
const DARK: typeof LIGHT = {
  ink: "#f6f4ef",
  muted: "rgba(246,244,239,0.62)",
  rule: "rgba(246,244,239,0.14)",
  strong: "rgba(246,244,239,0.3)",
  accent: "#e39a86",
  bg: "#161514",
  surface: "#1f1d1b",
  tint: "rgba(227,154,134,0.12)",
};
const vars = (t: typeof LIGHT) => Object.entries(t).map(([k, v]) => `--${k}: ${v};`).join(" ");

/** The colour tokens as CSS variables: one theme, or the light one switching to dark with the reader's setting. */
export function tokens(theme: Theme): string {
  if (theme !== "auto") return `svg { ${vars(theme === "dark" ? DARK : LIGHT)} }`;
  return `svg { ${vars(LIGHT)} }\n  @media (prefers-color-scheme: dark) {\n    svg { ${vars(DARK)} }\n  }`;
}

/** Type and the shapes most diagrams use. */
export const BASE_CSS = `
  text { font: 12px Inter, system-ui, sans-serif; fill: var(--ink); }
  .title { font: 400 26px "Instrument Serif", Georgia, serif; }
  .label { font-size: 10.5px; font-weight: 600; letter-spacing: 1.4px; fill: var(--muted); }
  .h { font-size: 13px; font-weight: 600; }
  .muted { fill: var(--muted); }
  .small { font-size: 11px; }
  .mono { font: 11px "IBM Plex Mono", ui-monospace, Consolas, monospace; fill: var(--muted); }
  .accent { fill: var(--accent); }
  .page { fill: var(--bg); }
  .tint { fill: var(--tint); }
  .box { fill: var(--surface); stroke: var(--strong); stroke-width: 1; }
  .box.key { stroke: var(--accent); stroke-width: 1.5; }
  .arrow { stroke: var(--muted); stroke-width: 1.5; fill: none; marker-end: url(#a); }
  .arrow.key { stroke: var(--accent); marker-end: url(#ak); }
  .tip { fill: var(--muted); }
  .tip.key { fill: var(--accent); }`;

/** Arrowheads for .arrow and .arrow.key. */
export const MARKERS = `  <defs>
    <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="tip" d="M 0 0 L 10 5 L 0 10 z" /></marker>
    <marker id="ak" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="tip key" d="M 0 0 L 10 5 L 0 10 z" /></marker>
  </defs>`;

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const num = (v: number) => String(Math.round(v * 10) / 10);

export function text(x: number, y: number, s: string, cls = "", anchor: "start" | "middle" | "end" = "start"): string {
  const c = cls ? ` class="${cls}"` : "";
  const a = anchor !== "start" ? ` text-anchor="${anchor}"` : "";
  return `  <text${c} x="${num(x)}" y="${num(y)}"${a}>${esc(s)}</text>`;
}

export function rect(x: number, y: number, w: number, h: number, cls: string, rx = 8, extra = ""): string {
  return `  <rect class="${cls}" x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${
    num(h)
  }" rx="${rx}"${extra} />`;
}

/** A box with a bold first line and smaller lines under it; lines `isMono` picks are set in the code font. */
export function box(
  x: number,
  y: number,
  w: number,
  h: number,
  lines: string[],
  cls = "box",
  isMono: (line: string) => boolean = () => false,
): string[] {
  const [head, ...rest] = lines;
  return [
    rect(x, y, w, h, cls),
    text(x + 12, y + 22, head, "h"),
    ...rest.map((line, k) => text(x + 12, y + 41 + 15 * k, line, isMono(line) ? "mono" : "muted small")),
  ];
}

export const arrow = (x1: number, y1: number, x2: number, y2: number, cls = "arrow") =>
  `  <path class="${cls}" d="M ${num(x1)} ${num(y1)} L ${num(x2)} ${num(y2)}" />`;

/** The whole SVG: title and description for screen readers, the styles, a page background, and the body. */
export function page(o: {
  width: number;
  height: number;
  title: string;
  desc: string;
  theme: Theme;
  css: string;
  body: string[];
  rx?: number;
}): { svg: string; width: number; height: number } {
  const { width: W, height: H } = o;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">`,
    `  <title id="t">${esc(o.title)}</title>`,
    `  <desc id="d">${esc(o.desc)}</desc>`,
    `  <style>${tokens(o.theme)}${o.css}</style>`,
    `  <rect class="page" width="${W}" height="${H}"${o.rx ? ` rx="${o.rx}"` : ""} />`,
    ...o.body,
    "</svg>",
    "",
  ].join("\n");
  return { svg, width: W, height: H };
}
