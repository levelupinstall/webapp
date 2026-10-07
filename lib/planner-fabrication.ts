/**
 * Internal fabrication package (NOT customer-facing).
 *
 * Generates the sheets Tom needs to actually build and install from:
 *  - Section sheet: true cross-section through the wall showing every shelf
 *    edge-on with the french cleat + hidden rod brackets, dimensioned.
 *  - Cut list sheet: part schedule (tag, size, qty, material) plus a
 *    fastener/mounting schedule and fabrication notes.
 *
 * Inputs come from the proposal's shopDrawingDims checklist (post-deposit,
 * pre/post site-measure). Anything not known from the checklist uses
 * standard shop practice and is marked TYP/* — Tom verifies on site.
 */

import type { ShopDrawingDimension } from "@/lib/client-portal-store";

export type FabShelf = { tag: string; lengthIn: number; heightIn: number };

export type FabWallInput = {
  wallLabel: string;
  widthIn: number | null;
  heightIn: number | null;
  shelves: FabShelf[];
  depthIn: number | null;
  finish: string | null;
};

export type FabSheet = {
  kind: "section" | "cutlist";
  caption: string;
  mimeType: "image/png";
  dataBase64: string;
};

const W = 1600;
const H = 1100;
const INK = "#1a1a1a";
const DIMC = "#444444";
const MILL_FILL = "#e9e9e9";

type SharpLike = (input: Buffer) => {
  png: () => { toBuffer: () => Promise<Buffer> };
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmtFrac(inches: number): string {
  const sign = inches < 0 ? "-" : "";
  const abs = Math.abs(inches);
  let whole = Math.floor(abs + 1e-9);
  let six = Math.round((abs - whole) * 16);
  if (six === 16) {
    whole += 1;
    six = 0;
  }
  if (six === 0) return `${sign}${whole}"`;
  let n = six;
  let d = 16;
  while (n % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  return whole === 0 ? `${sign}${n}/${d}"` : `${sign}${whole} ${n}/${d}"`;
}

const f1 = (n: number) => n.toFixed(1);

function tickV(x: number, y: number): string {
  return `<line x1="${f1(x - 6)}" y1="${f1(y + 6)}" x2="${f1(x + 6)}" y2="${f1(y - 6)}" stroke="${DIMC}" stroke-width="2"/>`;
}
function tickH(x: number, y: number): string {
  return `<line x1="${f1(x - 6)}" y1="${f1(y + 6)}" x2="${f1(x + 6)}" y2="${f1(y - 6)}" stroke="${DIMC}" stroke-width="2"/>`;
}

function titleBlock(svg: string[], opts: {
  project: string;
  part: string;
  finish: string;
  sheetNo: number;
  sheetCount: number;
}): void {
  const titleW = 380;
  const tbX = W - titleW - 30;
  const tbY = 90;
  const rowH = 44;
  const today = new Date().toISOString().slice(0, 10);
  const rows: Array<[string, string]> = [
    ["PROJECT", esc(opts.project)],
    ["PART", esc(opts.part)],
    ["FINISH", esc(opts.finish)],
    ["SCALE", "N.T.S. — DO NOT SCALE DRAWING"],
    ["DRAWN", "LEVEL UP INSTALL"],
    ["DATE", today],
    ["SHEET", `${opts.sheetNo} OF ${opts.sheetCount}`],
  ];
  svg.push(
    `<rect x="${tbX}" y="${tbY}" width="${titleW}" height="${rowH * rows.length + 64}" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>`,
    `<text x="${tbX + 14}" y="${tbY + 40}" font-family="sans-serif" font-size="20" font-weight="bold" fill="${INK}" letter-spacing="3">LEVEL UP INSTALL</text>`,
  );
  rows.forEach(([k, v], i) => {
    const ry = tbY + 64 + i * rowH;
    svg.push(
      `<line x1="${tbX}" y1="${ry}" x2="${tbX + titleW}" y2="${ry}" stroke="${INK}" stroke-width="1"/>`,
      `<text x="${tbX + 12}" y="${ry + 18}" font-family="sans-serif" font-size="11" fill="${DIMC}" letter-spacing="1">${k}</text>`,
      `<text x="${tbX + 12}" y="${ry + 36}" font-family="sans-serif" font-size="13" font-weight="bold" fill="${INK}">${v}</text>`,
    );
  });
}

function sheetHeader(svg: string[], title: string, subtitle: string): void {
  svg.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="150" y="44" font-family="sans-serif" font-size="26" font-weight="bold" fill="${INK}" letter-spacing="2">${esc(title)}</text>`,
    `<text x="150" y="68" font-family="sans-serif" font-size="13" fill="${DIMC}" letter-spacing="1">${esc(subtitle)}</text>`,
  );
}

const STD_NOTES = [
  "1. ALL JOB-SITE DIMENSIONS TO BE VERIFIED ON SITE BEFORE FABRICATION.",
  "2. DIMENSIONS MARKED * OR TYP ARE SHOP STANDARD — CONFIRM ON SITE.",
  "3. FINISHES AND MATERIALS PER APPROVED PROPOSAL.",
  "4. DO NOT SCALE DRAWING — USE WRITTEN DIMENSIONS ONLY.",
];

function generalNotes(svg: string[], extra: string[]): void {
  const y0 = H - 96;
  [...STD_NOTES, ...extra].forEach((n, i) => {
    svg.push(
      `<text x="150" y="${y0 + i * 20}" font-family="sans-serif" font-size="12.5" fill="${INK}">${esc(n)}</text>`,
    );
  });
}

async function toPng(svg: string[]): Promise<string | null> {
  try {
    const mod = (await import("sharp")) as unknown as
      | { default: SharpLike }
      | SharpLike;
    const sharpFn: SharpLike | undefined =
      typeof mod === "function" ? mod : mod.default;
    if (typeof sharpFn !== "function") return null;
    const buf = await sharpFn(Buffer.from(svg.join("\n"))).png().toBuffer();
    return buf.toString("base64");
  } catch {
    return null;
  }
}

/** Build a FabWallInput from the stored shop-drawing dimension checklist. */
export function fabInputFromDims(
  dims: ShopDrawingDimension[],
  wallLabel: string,
): FabWallInput {
  const forWall = dims.filter((d) => d.wallLabel === wallLabel);
  const find = (name: string) => forWall.find((d) => d.name === name)?.expectedIn ?? null;
  const shelves: FabShelf[] = [];
  const heightRe = /^Shelf (\d+) height A\.F\.F\.$/;
  for (const d of forWall) {
    const m = d.name.match(heightRe);
    if (!m) continue;
    const n = m[1];
    const len = forWall.find((x) => x.name === `Shelf ${n} length (SH-${n})`)?.expectedIn ?? null;
    if (len !== null) shelves.push({ tag: `SH-${n}`, lengthIn: len, heightIn: d.expectedIn });
  }
  shelves.sort((a, b) => a.heightIn - b.heightIn);
  return {
    wallLabel,
    widthIn: find("Wall width"),
    heightIn: find("Wall height"),
    shelves,
    depthIn: find("Millwork depth"),
    finish: null,
  };
}

/**
 * Section sheet: large TYPICAL section through one shelf (Scepter-style
 * 1:4 detail) plus a small LOCATION diagram showing every shelf's A.F.F.
 * height. Dimensioned, with numbered callouts and a legend.
 */
export async function buildSectionSheet(params: {
  input: FabWallInput;
  projectName?: string;
  sheetNo?: number;
  sheetCount?: number;
}): Promise<FabSheet | null> {
  const { input } = params;
  const project = (params.projectName || "RESIDENTIAL MILLWORK").toUpperCase();
  const label = input.wallLabel.toUpperCase();
  const depthIn = input.depthIn ?? 10;
  const depthKnown = input.depthIn !== null;
  const boardT = 1.5; // shop standard floating-shelf thickness (TYP)
  const cleatH = 0.75;
  const rodDia = 0.5;
  const rodLen = 8;

  const svg: string[] = [];
  sheetHeader(
    svg,
    `SECTION — ${label}`,
    "FABRICATION SECTION — INTERNAL · VERIFY ALL DIMENSIONS ON SITE BEFORE FABRICATION",
  );

  const mTop = 150;
  const fy = H - 190; // finished floor line
  const drawH = fy - mTop;

  // ---------- LOCATION panel (left): all shelves at A.F.F. heights ----------
  const locX = 170;
  const locW = 110;
  const maxH = Math.max(...input.shelves.map((s) => s.heightIn), 60);
  const ls = drawH / (maxH + 10);
  const locTop = fy - (maxH + 6) * ls;
  svg.push(
    `<text x="${f1(locX + locW / 2)}" y="${f1(mTop - 24)}" font-family="sans-serif" font-size="14" font-weight="bold" fill="${INK}" text-anchor="middle" letter-spacing="2">LOCATION</text>`,
    `<rect x="${f1(locX)}" y="${f1(locTop)}" width="${f1(locW)}" height="${f1(fy - locTop)}" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`,
    `<line x1="${f1(locX - 40)}" y1="${f1(fy)}" x2="${f1(locX + locW + 40)}" y2="${f1(fy)}" stroke="${INK}" stroke-width="3.5"/>`,
    `<text x="${f1(locX - 46)}" y="${f1(fy + 22)}" font-family="sans-serif" font-size="12" fill="${DIMC}" text-anchor="end">F.F.</text>`,
  );
  const asc = input.shelves.slice().sort((a, b) => a.heightIn - b.heightIn);
  const chainX = locX - 56;
  svg.push(
    `<line x1="${f1(chainX)}" y1="${f1(fy - asc[asc.length - 1].heightIn * ls)}" x2="${f1(chainX)}" y2="${f1(fy)}" stroke="${DIMC}" stroke-width="1.5"/>`,
  );
  tickV(chainX, fy);
  for (const s of asc) {
    const y = fy - s.heightIn * ls;
    tickV(chainX, y);
    svg.push(
      `<line x1="${f1(locX)}" y1="${f1(y)}" x2="${f1(locX + locW)}" y2="${f1(y)}" stroke="${INK}" stroke-width="3"/>`,
      `<line x1="${f1(locX - 6)}" y1="${f1(y)}" x2="${f1(chainX + 8)}" y2="${f1(y)}" stroke="${DIMC}" stroke-width="1" stroke-dasharray="5 4"/>`,
      `<text x="${f1(chainX - 14)}" y="${f1(y + 4)}" font-family="monospace" font-size="13" font-weight="bold" fill="${INK}" text-anchor="middle" transform="rotate(-90 ${f1(chainX - 14)} ${f1(y + 4)})">${fmtFrac(s.heightIn)} AFF</text>`,
      `<text x="${f1(locX + locW + 12)}" y="${f1(y + 5)}" font-family="monospace" font-size="12" font-weight="bold" fill="${INK}">${esc(s.tag)}</text>`,
    );
  }
  svg.push(
    `<text x="${f1(locX + locW / 2)}" y="${f1(fy + 52)}" font-family="sans-serif" font-size="12" fill="${DIMC}" text-anchor="middle">N.T.S.</text>`,
  );

  // ---------- TYPICAL SECTION (center, large) ----------
  const secX0 = 480; // wall face
  const secRight = 1080;
  const ss = Math.min((secRight - secX0) / (depthIn + 5), drawH / 26);
  const wallBandPx = 44;
  const shelfX0 = secX0 + wallBandPx;
  const boardPx = depthIn * ss;
  const thickPx = Math.max(30, boardT * ss);
  // Shelf drawn floating, centered vertically in the drawing area.
  const secTopY = mTop + drawH / 2 - thickPx / 2 - 60;
  const wallTopY = secTopY - 150;
  const wallBotY = secTopY + thickPx + 150;

  svg.push(
    `<text x="${f1((secX0 + secRight) / 2)}" y="${f1(mTop - 24)}" font-family="sans-serif" font-size="14" font-weight="bold" fill="${INK}" text-anchor="middle" letter-spacing="2">TYPICAL SECTION THROUGH SHELF</text>`,
  );
  // wall band, hatched
  svg.push(
    `<rect x="${f1(secX0)}" y="${f1(wallTopY)}" width="${f1(wallBandPx)}" height="${f1(wallBotY - wallTopY)}" fill="#f4f4f4" stroke="${INK}" stroke-width="2.5"/>`,
  );
  for (let hy = wallTopY + 10; hy < wallBotY - 6; hy += 16) {
    svg.push(
      `<line x1="${f1(secX0 + 4)}" y1="${f1(hy)}" x2="${f1(secX0 + wallBandPx - 4)}" y2="${f1(hy - 9)}" stroke="${DIMC}" stroke-width="1"/>`,
    );
  }
  svg.push(
    `<text x="${f1(secX0 + wallBandPx / 2)}" y="${f1(wallTopY - 12)}" font-family="sans-serif" font-size="12" fill="${DIMC}" text-anchor="middle">WALL</text>`,
  );
  // board
  svg.push(
    `<rect x="${f1(shelfX0)}" y="${f1(secTopY)}" width="${f1(boardPx)}" height="${f1(thickPx)}" fill="${MILL_FILL}" stroke="${INK}" stroke-width="3"/>`,
    `<line x1="${f1(shelfX0 + 8)}" y1="${f1(secTopY + 5)}" x2="${f1(shelfX0 + 8)}" y2="${f1(secTopY + thickPx - 5)}" stroke="${INK}" stroke-width="1.25"/>`,
    `<line x1="${f1(shelfX0 + boardPx - 8)}" y1="${f1(secTopY + 5)}" x2="${f1(shelfX0 + boardPx - 8)}" y2="${f1(secTopY + thickPx - 5)}" stroke="${INK}" stroke-width="1.25"/>`,
  );
  // french cleat pair under rear of shelf
  const cleatLenPx = Math.min(4.5 * ss, boardPx * 0.5);
  const cleatHPx = Math.max(16, cleatH * ss);
  const cleatY = secTopY + thickPx;
  svg.push(
    // wall-side cleat
    `<polygon points="${f1(shelfX0)},${f1(cleatY)} ${f1(shelfX0 + cleatLenPx)},${f1(cleatY)} ${f1(shelfX0 + cleatLenPx - cleatHPx)},${f1(cleatY + cleatHPx)} ${f1(shelfX0)},${f1(cleatY + cleatHPx)}" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>`,
    // shelf-side cleat (mirrored, hangs on wall cleat)
    `<polygon points="${f1(shelfX0 + cleatHPx * 0.9)},${f1(cleatY + 3)} ${f1(shelfX0 + cleatLenPx)},${f1(cleatY + 3)} ${f1(shelfX0 + cleatLenPx - cleatHPx * 0.9)},${f1(cleatY + 3 - cleatHPx * 0.55)} ${f1(shelfX0 + cleatHPx * 0.9)},${f1(cleatY + 3 - cleatHPx * 0.55)}" fill="${MILL_FILL}" stroke="${INK}" stroke-width="2"/>`,
  );
  // hidden rod bracket (dashed) through board
  const rodY = secTopY + thickPx / 2;
  const rodLenPx = Math.min(rodLen * ss, boardPx * 0.85);
  svg.push(
    `<line x1="${f1(shelfX0 - wallBandPx * 0.5)}" y1="${f1(rodY)}" x2="${f1(shelfX0 + rodLenPx)}" y2="${f1(rodY)}" stroke="${INK}" stroke-width="2.5" stroke-dasharray="14 8"/>`,
    `<circle cx="${f1(shelfX0 + rodLenPx)}" cy="${f1(rodY)}" r="5" fill="${INK}"/>`,
  );

  // Numbered callout bubbles + legend.
  const bubbles: Array<[number, number, string]> = [
    [shelfX0 + boardPx * 0.62, secTopY + thickPx / 2, "1"],
    [shelfX0 + cleatLenPx / 2, cleatY + cleatHPx / 2, "2"],
    [shelfX0 + rodLenPx * 0.55, rodY, "3"],
  ];
  for (const [bx, by, n] of bubbles) {
    svg.push(
      `<circle cx="${f1(bx)}" cy="${f1(by)}" r="15" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`,
      `<text x="${f1(bx)}" y="${f1(by + 5.5)}" font-family="sans-serif" font-size="15" font-weight="bold" fill="${INK}" text-anchor="middle">${n}</text>`,
    );
  }
  const legendX = secX0;
  let legendY = wallBotY + 44;
  const legend: string[] = [
    `1 — SHELF BOARD ${fmtFrac(boardT)} * THK, PAINT-GRADE BIRCH PLY (TYP)`,
    `2 — FRENCH CLEAT PAIR, 3/4" PLY 45° RIP × 3 1/2" WIDE * (TYP)`,
    `3 — Ø${fmtFrac(rodDia)} × ${rodLen}" HIDDEN STEEL ROD BRACKET * (TYP)`,
    `4 — #10 × 3" WOOD SCREWS @ 16" O.C. INTO STUDS / BLOCKING AS REQ'D`,
  ];
  svg.push(
    `<text x="${f1(legendX)}" y="${f1(legendY - 24)}" font-family="sans-serif" font-size="13" font-weight="bold" fill="${INK}" letter-spacing="2">NOTES</text>`,
  );
  for (const line of legend) {
    svg.push(
      `<text x="${f1(legendX)}" y="${f1(legendY)}" font-family="monospace" font-size="12.5" fill="${INK}">${esc(line)}</text>`,
    );
    legendY += 24;
  }

  // Dimensions on the typical section.
  // Depth (below board).
  const depY = cleatY + cleatHPx + 52;
  svg.push(
    `<line x1="${f1(shelfX0)}" y1="${f1(cleatY + cleatHPx + 6)}" x2="${f1(shelfX0)}" y2="${f1(depY + 8)}" stroke="${DIMC}" stroke-width="1"/>`,
    `<line x1="${f1(shelfX0 + boardPx)}" y1="${f1(cleatY + cleatHPx + 6)}" x2="${f1(shelfX0 + boardPx)}" y2="${f1(depY + 8)}" stroke="${DIMC}" stroke-width="1"/>`,
    `<line x1="${f1(shelfX0)}" y1="${f1(depY)}" x2="${f1(shelfX0 + boardPx)}" y2="${f1(depY)}" stroke="${DIMC}" stroke-width="1.5"/>`,
    tickH(shelfX0, depY),
    tickH(shelfX0 + boardPx, depY),
    `<text x="${f1(shelfX0 + boardPx / 2)}" y="${f1(depY - 10)}" font-family="monospace" font-size="16" font-weight="bold" fill="${INK}" text-anchor="middle">${fmtFrac(depthIn)}${depthKnown ? "" : " *"}</text>`,
  );
  // Thickness (right of board front).
  const thX = shelfX0 + boardPx + 30;
  svg.push(
    `<line x1="${f1(thX)}" y1="${f1(secTopY)}" x2="${f1(thX)}" y2="${f1(secTopY + thickPx)}" stroke="${DIMC}" stroke-width="1.5"/>`,
    tickV(thX, secTopY),
    tickV(thX, secTopY + thickPx),
    `<text x="${f1(thX + 18)}" y="${f1(secTopY + thickPx / 2 + 5)}" font-family="monospace" font-size="14" fill="${INK}">${fmtFrac(boardT)} *</text>`,
  );
  // Rod length (above rod).
  const rodDimY = rodY - 26;
  svg.push(
    `<line x1="${f1(shelfX0)}" y1="${f1(rodDimY)}" x2="${f1(shelfX0 + rodLenPx)}" y2="${f1(rodDimY)}" stroke="${DIMC}" stroke-width="1.25"/>`,
    tickH(shelfX0, rodDimY),
    tickH(shelfX0 + rodLenPx, rodDimY),
    `<text x="${f1(shelfX0 + rodLenPx / 2)}" y="${f1(rodDimY - 8)}" font-family="monospace" font-size="12" fill="${INK}" text-anchor="middle">${rodLen}" *</text>`,
  );

  titleBlock(svg, {
    project,
    part: `SECTION — ${label}`,
    finish: (input.finish || "PER APPROVED PROPOSAL").toUpperCase().slice(0, 34),
    sheetNo: params.sheetNo ?? 1,
    sheetCount: params.sheetCount ?? 1,
  });
  generalNotes(svg, [
    "5. ROD BRACKETS @ 16\" O.C. MAX, MIN 2 PER SHELF; 3\" MIN FROM EACH END (TYP).",
    "6. EASE ALL EXPOSED EDGES; FILL + SAND FASTENER HOLES BEFORE FINISH.",
  ]);
  svg.push(`</svg>`);

  const dataBase64 = await toPng(svg);
  if (!dataBase64) return null;
  return {
    kind: "section",
    caption: `Fabrication section — ${input.wallLabel}`,
    mimeType: "image/png",
    dataBase64,
  };
}

/**
 * Cut list sheet: part schedule table + fastener/mounting schedule.
 */
export async function buildCutListSheet(params: {
  input: FabWallInput;
  projectName?: string;
  sheetNo?: number;
  sheetCount?: number;
}): Promise<FabSheet | null> {
  const { input } = params;
  const project = (params.projectName || "RESIDENTIAL MILLWORK").toUpperCase();
  const label = input.wallLabel.toUpperCase();
  const depthIn = input.depthIn ?? 10;
  const finish = (input.finish || "PER APPROVED PROPOSAL").toUpperCase();

  const svg: string[] = [];
  sheetHeader(
    svg,
    `CUT LIST — ${label}`,
    "PART SCHEDULE + MOUNTING SCHEDULE — INTERNAL · VERIFY ALL DIMENSIONS ON SITE BEFORE FABRICATION",
  );

  // Part schedule table.
  const tx = 150;
  const tw = W - tx - 470;
  const cols: Array<[string, number]> = [
    ["TAG", 0.09],
    ["DESCRIPTION", 0.27],
    ["LENGTH", 0.11],
    ["DEPTH", 0.1],
    ["THICK", 0.09],
    ["QTY", 0.07],
    ["MATERIAL", 0.16],
    ["NOTES", 0.11],
  ];
  const headerH = 40;
  const rowH = 44;
  type Row = string[];
  const rows: Row[] = [];
  for (const s of input.shelves) {
    rows.push([
      s.tag,
      "FLOATING SHELF",
      fmtFrac(s.lengthIn),
      fmtFrac(depthIn),
      `1 1/2" *`,
      "1",
      "PAINT-GRADE BIRCH PLY",
      "RODS + CLEAT",
    ]);
    rows.push([
      `CL-${s.tag.slice(3)}`,
      "FRENCH CLEAT (PAIR)",
      fmtFrac(s.lengthIn),
      `3 1/2" *`,
      `3/4" *`,
      "1 PR",
      "PLYWOOD",
      "45° RIP",
    ]);
  }
  const tableH = headerH + rows.length * rowH;
  const ty = 150;
  svg.push(
    `<rect x="${tx}" y="${ty}" width="${tw}" height="${tableH}" fill="#ffffff" stroke="${INK}" stroke-width="2.5"/>`,
  );
  let cx = tx;
  const colX: number[] = [];
  for (const [, frac] of cols) {
    colX.push(cx);
    cx += tw * frac;
  }
  colX.push(tx + tw);
  // header
  svg.push(`<rect x="${tx}" y="${ty}" width="${tw}" height="${headerH}" fill="${INK}"/>`);
  cols.forEach(([name], i) => {
    svg.push(
      `<text x="${f1(colX[i] + 10)}" y="${ty + 26}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#ffffff" letter-spacing="1">${esc(name)}</text>`,
    );
  });
  rows.forEach((row, r) => {
    const ry = ty + headerH + r * rowH;
    if (r % 2 === 1) svg.push(`<rect x="${tx}" y="${ry}" width="${tw}" height="${rowH}" fill="#f4f4f4"/>`);
    svg.push(`<line x1="${tx}" y1="${ry}" x2="${tx + tw}" y2="${ry}" stroke="${INK}" stroke-width="1"/>`);
    row.forEach((cell, c) => {
      svg.push(
        `<text x="${f1(colX[c] + 10)}" y="${ry + 28}" font-family="${c === 0 ? "monospace" : "sans-serif"}" font-size="13" ${c === 0 ? 'font-weight="bold"' : ""} fill="${INK}">${esc(cell)}</text>`,
      );
    });
    for (let c = 1; c < cols.length; c++) {
      svg.push(`<line x1="${f1(colX[c])}" y1="${ry}" x2="${f1(colX[c])}" y2="${ry + rowH}" stroke="${DIMC}" stroke-width="1"/>`);
    }
  });

  // Fastener / mounting schedule below the table.
  const schedY = ty + tableH + 60;
  svg.push(
    `<text x="${tx}" y="${schedY}" font-family="sans-serif" font-size="16" font-weight="bold" fill="${INK}" letter-spacing="2">MOUNTING SCHEDULE</text>`,
  );
  const rodQtyPerShelf = (lenIn: number) => Math.max(2, Math.round(lenIn / 24));
  const sched: string[] = [];
  for (const s of input.shelves) {
    sched.push(
      `${s.tag}: ${rodQtyPerShelf(s.lengthIn)}× Ø1/2" × 12" hidden steel rod brackets + 1 pr french cleat, #10 × 3" screws @ 16" O.C. into studs.`,
    );
  }
  sched.forEach((line, i) => {
    svg.push(
      `<text x="${tx}" y="${schedY + 30 + i * 24}" font-family="monospace" font-size="12.5" fill="${INK}">${esc(line)}</text>`,
    );
  });

  titleBlock(svg, {
    project,
    part: `CUT LIST — ${label}`,
    finish: finish.slice(0, 34),
    sheetNo: params.sheetNo ?? 1,
    sheetCount: params.sheetCount ?? 1,
  });
  generalNotes(svg, [
    "5. ALL SHEET GOODS: PAINT-GRADE UNLESS NOTED; EASE EXPOSED EDGES.",
    "6. QUANTITIES COVER ONE WALL — MULTIPLY PER SITE MEASURE IF MIRRORED.",
  ]);
  svg.push(`</svg>`);

  const dataBase64 = await toPng(svg);
  if (!dataBase64) return null;
  return {
    kind: "cutlist",
    caption: `Cut list — ${input.wallLabel}`,
    mimeType: "image/png",
    dataBase64,
  };
}
