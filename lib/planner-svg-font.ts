/**
 * Embedded-font helper for planner SVG drawings.
 *
 * Vercel's serverless runtime ships no system fonts, so SVG text rendered
 * through sharp/librsvg comes out as tofu boxes. librsvg ignores @font-face,
 * so embedding fonts in the SVG is not enough — the fonts must be visible
 * to fontconfig at render time.
 *
 * This module installs subsetted DejaVu fonts (open-licensed, inlined in
 * lib/planner-font-data.ts at build time by scripts/gen-font-data.py) into
 * /tmp and points fontconfig at them via FONTCONFIG_PATH before the first
 * render. /tmp is writable in Vercel functions; public/ is NOT readable
 * from serverless functions, which is why the fonts live in the JS bundle.
 *
 * Server-only: imported by lib/planner-*.ts render modules, never by
 * client components.
 *
 * Usage: call `ensurePlannerFonts()` before any sharp SVG->PNG render, and
 * insert `svgFontStyle()` right after the opening `<svg ...>` tag.
 * Use font-family="DejaVu Sans" / "DejaVu Sans Mono" in <text> elements;
 * generic "sans-serif"/"monospace" are aliased to DejaVu via fonts.conf.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEJAVUSANS_B64,
  DEJAVUSANS_BOLD_B64,
  DEJAVUSANSMONO_B64,
} from "./planner-font-data";

const FONT_DIR = "/tmp/planner-fonts";
const READY_FILE = join(FONT_DIR, ".ready");

function fontConfigXml(): string {
  return `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONT_DIR}</dir>
  <cachedir>${FONT_DIR}/cache</cachedir>
  <alias>
    <family>sans-serif</family>
    <prefer><family>DejaVu Sans</family></prefer>
  </alias>
  <alias>
    <family>monospace</family>
    <prefer><family>DejaVu Sans Mono</family></prefer>
  </alias>
</fontconfig>
`;
}

/** Write fonts + fonts.conf to /tmp and point fontconfig at them. Idempotent. */
export function ensurePlannerFonts(): void {
  try {
    if (!existsSync(READY_FILE)) {
      mkdirSync(join(FONT_DIR, "cache"), { recursive: true });
      writeFileSync(join(FONT_DIR, "DejaVuSans.ttf"), Buffer.from(DEJAVUSANS_B64, "base64"));
      writeFileSync(join(FONT_DIR, "DejaVuSans-Bold.ttf"), Buffer.from(DEJAVUSANS_BOLD_B64, "base64"));
      writeFileSync(join(FONT_DIR, "DejaVuSansMono.ttf"), Buffer.from(DEJAVUSANSMONO_B64, "base64"));
      writeFileSync(join(FONT_DIR, "fonts.conf"), fontConfigXml());
      writeFileSync(READY_FILE, "1");
    }
    // Must be set before fontconfig's first init in this process. Module
    // import happens at cold start, before any render, so this sticks.
    if (!process.env.FONTCONFIG_PATH) {
      process.env.FONTCONFIG_PATH = FONT_DIR;
    }
  } catch {
    // Font install is best-effort; rendering falls back to tofu rather
    // than crashing the request.
  }
}

// Install at import time so the env var is set before fontconfig ever
// initializes in this process.
ensurePlannerFonts();

function fontFace(family: string, b64: string, weight: string): string {
  return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/ttf;base64,${b64}) format("truetype");}`;
}

const CACHED_STYLE =
  `<style>` +
  fontFace("DejaVu Sans", DEJAVUSANS_B64, "normal") +
  fontFace("DejaVu Sans", DEJAVUSANS_BOLD_B64, "bold") +
  fontFace("DejaVu Sans Mono", DEJAVUSANSMONO_B64, "normal") +
  `</style>`;

/** Inline <style> block for the SVG (helps renderers that honor @font-face). */
export function svgFontStyle(): string {
  return CACHED_STYLE;
}
