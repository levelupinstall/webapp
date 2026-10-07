/**
 * Embedded-font helper for planner SVG drawings.
 *
 * Vercel's serverless runtime ships no system fonts, so SVG text rendered
 * through sharp/librsvg comes out as tofu boxes. This module base64-embeds
 * DejaVu (open-licensed, bundled in public/fonts) directly into the SVG via
 * @font-face, so text renders identically everywhere.
 *
 * Usage: insert `svgFontStyle()` right after the opening `<svg ...>` tag,
 * and use font-family="DejaVu Sans" / "DejaVu Sans Mono" in <text> elements.
 * (Generic "sans-serif"/"monospace" fall back to nothing on Vercel.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null = null;

function fontFace(family: string, file: string, weight: string): string {
  const buf = readFileSync(join(process.cwd(), "public", "fonts", file));
  const b64 = buf.toString("base64");
  return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/ttf;base64,${b64}) format("truetype");}`;
}

export function svgFontStyle(): string {
  if (!cached) {
    cached =
      `<style>` +
      fontFace("DejaVu Sans", "DejaVuSans.ttf", "normal") +
      fontFace("DejaVu Sans", "DejaVuSans-Bold.ttf", "bold") +
      fontFace("DejaVu Sans Mono", "DejaVuSansMono.ttf", "normal") +
      `</style>`;
  }
  return cached;
}
