/**
 * Renders the icon set (public/svg/icons.svg) to docs/images/icons.png with headless Chrome: every icon,
 * named, at its sizes, in the light and the dark theme. docs/DESIGN.md and the design guide show it.
 * Also renders the site mark (public/svg/favicon.svg) to public/png/: a 32px favicon and the
 * 180px Apple touch icon.
 * Run after adding or changing an icon:  npm run icon-sheet
 *
 * The page is built here with the sprite inlined, so it needs no files and no server.
 * Chrome is found at CHROME_PATH or the usual install locations.
 */
import { mkdir, readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { findChrome } from "./chrome.ts";

const chrome = findChrome();

const sprite = await readFile(new URL("../public/svg/icons.svg", import.meta.url), "utf8");
const names = [...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
const out = new URL("../docs/images/icons.png", import.meta.url);

// The design guide's tokens (docs/DESIGN.md): paper and ink, the rule, the muted text.
const themes = [
  { name: "Light", bg: "#f6f4ef", card: "#fffdf9", ink: "#161514", muted: "#6b6760", rule: "#dfdad0" },
  {
    name: "Dark",
    bg: "#161514",
    card: "#201f1e",
    ink: "#f6f4ef",
    muted: "rgba(246,244,239,0.62)",
    rule: "rgba(246,244,239,0.14)",
  },
];
const icon = (name: string, size: number) =>
  `<svg class="icon" width="${size}" height="${size}" aria-hidden="true"><use href="#${name}"/></svg>`;
const panel = (t: (typeof themes)[number]) => `
  <section style="background:${t.bg};color:${t.ink}">
    <h2 style="color:${t.muted}">${t.name}</h2>
    <div class="grid">${
  names.map((n) => `
      <div class="cell" style="background:${t.card};border-color:${t.rule}">
        <div class="sizes">${icon(n, 32)}${icon(n, 20)}${icon(n, 16)}</div>
        <code style="color:${t.muted}">${n}</code>
      </div>`).join("")
}
    </div>
  </section>`;

const html = `<!doctype html><meta charset="utf-8">
<style>
  body { margin: 0; font: 13px Inter, system-ui, sans-serif; }
  section { padding: 28px 32px 32px; }
  h2 { margin: 0 0 16px; font: 600 11px Inter, system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; }
  .grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
  .cell { display: grid; gap: 12px; justify-items: center; padding: 18px 8px 12px; border: 1px solid; border-radius: 14px; }
  .sizes { display: flex; align-items: center; gap: 14px; }
  code { font: 12px "IBM Plex Mono", ui-monospace, monospace; }
  .icon { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
</style>
<body>
${sprite.replace("<svg ", '<svg style="display:none" ')}
<header style="padding:28px 32px 0;background:${themes[0].bg};color:${themes[0].ink}">
  <div style="font:400 30px 'Instrument Serif', Georgia, serif">Icons</div>
  <div style="color:${
  themes[0].muted
};margin-top:4px">public/svg/icons.svg · outline, 24px grid, 2px line, round caps and joins · shown at 32, 20 and 16px</div>
</header>
${themes.map(panel).join("")}
</body>`;

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--hide-scrollbars"] });
try {
  const tab = await browser.newPage();
  await tab.setViewport({ width: 960, height: 600, deviceScaleFactor: 2 });
  await tab.setContent(html, { waitUntil: "load" });
  await tab.screenshot({ path: decodeURIComponent(out.pathname.replace(/^\/([A-Z]:)/, "$1")), fullPage: true });
  console.log(`Wrote docs/images/icons.png: ${names.length} icons, light and dark`);

  // The site's mark as the PNGs browsers and phones want: a 32px favicon, and a 180px Apple touch
  // icon on paper (iOS shows transparency as black).
  const mark = await readFile(new URL("../public/svg/favicon.svg", import.meta.url), "utf8");
  await mkdir(new URL("../public/png/", import.meta.url), { recursive: true });
  for (
    const [name, size, background, inset] of [
      ["favicon-32.png", 32, "transparent", 0],
      ["apple-touch-icon.png", 180, "#f6f4ef", 18],
    ] as const
  ) {
    await tab.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await tab.setContent(
      `<!doctype html><body style="margin:0;background:${background}">` +
        `<div style="width:${size}px;height:${size}px;padding:${inset}px;box-sizing:border-box">` +
        mark.replace("<svg ", '<svg width="100%" height="100%" ') + "</div></body>",
    );
    const png = new URL(`../public/png/${name}`, import.meta.url);
    await tab.screenshot({
      path: decodeURIComponent(png.pathname.replace(/^\/([A-Z]:)/, "$1")),
      omitBackground: background === "transparent",
    });
    console.log(`Wrote public/png/${name}`);
  }
} finally {
  await browser.close();
}
