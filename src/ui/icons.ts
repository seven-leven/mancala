/**
 * The site's icons, from the one sprite (public/svg/icons.svg). In HTML write
 * `<svg class="icon" aria-hidden="true"><use href="svg/icons.svg?v={{ build }}#name"/></svg>`;
 * from a script, call icon(). docs/DESIGN.md, "Icons", has the rules and the full set.
 */
export type IconName =
  | "sound-on"
  | "sound-off"
  | "stats"
  | "settings"
  | "help"
  | "close"
  | "chevron-down"
  | "arrow-right"
  | "undo"
  | "skip"
  | "replay"
  | "relay"
  | "free-turn"
  | "capture"
  | "tip";

/** The build stamp (tools/build.ts), so the sprite is always the one built with this page. */
declare const __BUILD__: string;
const build = typeof __BUILD__ === "string" ? __BUILD__ : "dev";

const SVG = "http://www.w3.org/2000/svg";

/** An icon, decorative (aria-hidden): give its button an aria-label when it has no text. */
export function icon(name: IconName, className = ""): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", `icon ${className}`.trim());
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG, "use");
  use.setAttribute("href", `svg/icons.svg?v=${build}#${name}`);
  svg.append(use);
  return svg;
}
