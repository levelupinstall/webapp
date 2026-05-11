import sharp from "sharp";

/** Unit envelope for a front elevation (width × height). Depth is optional metadata only. */
export type ShelvingBlueprintDimensions = {
  widthIn: number;
  heightIn: number;
  depthIn?: number;
};

export type ShelvingBlueprintLayout = {
  /** Y of each shelf measured from the unit floor (inches), ascending. */
  shelfYsInches: number[];
  /** Same positions as a fraction of unit height (0 = floor, 1 = top). */
  shelfYsNormalized: number[];
};

const MAX_SHELVES = 48;
const DEFAULT_RASTER_WIDTH = 512;

/**
 * Computes evenly spaced shelf levels inside the unit height (exclusive of
 * top/bottom plates): y = heightIn * (i + 1) / (count + 1).
 */
export function generateShelvingBlueprint(
  dimensions: ShelvingBlueprintDimensions,
  count: number,
): ShelvingBlueprintLayout {
  const heightIn = dimensions.heightIn;
  if (
    !Number.isFinite(heightIn) ||
    heightIn <= 0 ||
    !Number.isFinite(count) ||
    count < 1
  ) {
    return { shelfYsInches: [], shelfYsNormalized: [] };
  }

  const n = Math.min(Math.floor(count), MAX_SHELVES);
  const shelfYsInches: number[] = [];
  for (let i = 0; i < n; i++) {
    shelfYsInches.push((heightIn * (i + 1)) / (n + 1));
  }
  const shelfYsNormalized = shelfYsInches.map((y) => y / heightIn);
  return { shelfYsInches, shelfYsNormalized };
}

function buildShelvingElevationSvg(
  dimensions: ShelvingBlueprintDimensions,
  count: number,
  pixelWidth: number,
): { svg: string; layout: ShelvingBlueprintLayout } {
  const layout = generateShelvingBlueprint(dimensions, count);
  const wIn = dimensions.widthIn;
  const hIn = dimensions.heightIn;
  if (
    !Number.isFinite(wIn) ||
    wIn <= 0 ||
    !Number.isFinite(hIn) ||
    hIn <= 0 ||
    layout.shelfYsInches.length === 0
  ) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="64"><rect width="100%" height="100%" fill="#000"/></svg>`,
      layout,
    };
  }

  const aspect = hIn / wIn;
  const pixelHeight = Math.max(64, Math.round(pixelWidth * aspect));
  const pad = 14;
  const iw = pixelWidth - 2 * pad;
  const ih = pixelHeight - 2 * pad;
  const x0 = pad;
  const y0 = pad;
  const x1 = pad + iw;
  const y1 = pad + ih;

  const parts: string[] = [
    `<rect x="0" y="0" width="${pixelWidth}" height="${pixelHeight}" fill="#000"/>`,
    `<polyline points="${x0},${y0} ${x1},${y0} ${x1},${y1} ${x0},${y1} ${x0},${y0}" fill="none" stroke="#ffffff" stroke-width="2"/>`,
  ];

  for (const yIn of layout.shelfYsInches) {
    const yCanvas = y0 + ih - (yIn / hIn) * ih;
    parts.push(
      `<line x1="${x0}" y1="${yCanvas}" x2="${x1}" y2="${yCanvas}" stroke="#ffffff" stroke-width="2"/>`,
    );
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}">${parts.join("")}</svg>`;
  return { svg, layout };
}

/**
 * Rasterizes a simple elevation: white strokes on black (PNG buffer).
 */
export async function renderShelvingBlueprintToPng(
  dimensions: ShelvingBlueprintDimensions,
  shelfCount: number,
  options?: { pixelWidth?: number },
): Promise<Buffer> {
  const pixelWidth = options?.pixelWidth ?? DEFAULT_RASTER_WIDTH;
  const { svg } = buildShelvingElevationSvg(dimensions, shelfCount, pixelWidth);
  return sharp(Buffer.from(svg, "utf8")).png().toBuffer();
}
