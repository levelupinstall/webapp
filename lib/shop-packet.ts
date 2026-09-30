import type { ShopPacket } from "./planner-estimate";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Scaled front-elevation SVG of the shop packet: wall outline, placed elements,
 * and dimension labels. Black on white, print-friendly.
 */
export function shopPacketToSvg(packet: ShopPacket): string {
  const wallW = Math.max(1, packet.wallWidthIn);
  const wallH = Math.max(1, packet.wallHeightIn);

  const PAD_L = 120; // room for height dims
  const PAD_R = 40;
  const PAD_T = 40;
  const PAD_B = 90; // room for width dims
  const DRAW_W = 920;
  const scale = DRAW_W / wallW;
  const drawH = wallH * scale;
  const W = PAD_L + DRAW_W + PAD_R;
  const H = PAD_T + drawH + PAD_B;

  const X = (inches: number) => PAD_L + inches * scale;
  // SVG y grows downward; wall bottom sits at PAD_T + drawH
  const Y = (inchesAff: number) => PAD_T + drawH - inchesAff * scale;

  const dimColor = "#1a1a1a";
  const parts: string[] = [];

  // Wall outline
  parts.push(
    `<rect x="${X(0)}" y="${Y(wallH)}" width="${wallW * scale}" height="${drawH}" fill="#ffffff" stroke="${dimColor}" stroke-width="2.5"/>`,
  );
  // Floor line
  parts.push(
    `<line x1="${X(0) - 30}" y1="${Y(0)}" x2="${X(wallW) + 30}" y2="${Y(0)}" stroke="${dimColor}" stroke-width="2.5"/>`,
  );
  parts.push(
    `<text x="${X(0) - 34}" y="${Y(0) + 4}" font-size="13" text-anchor="end" fill="${dimColor}">FLOOR</text>`,
  );

  // Overall wall width dimension (bottom)
  const dimY = Y(0) + 52;
  parts.push(
    `<line x1="${X(0)}" y1="${Y(0) + 8}" x2="${X(0)}" y2="${dimY + 6}" stroke="${dimColor}" stroke-width="1"/>`,
    `<line x1="${X(wallW)}" y1="${Y(0) + 8}" x2="${X(wallW)}" y2="${dimY + 6}" stroke="${dimColor}" stroke-width="1"/>`,
    `<line x1="${X(0)}" y1="${dimY}" x2="${X(wallW)}" y2="${dimY}" stroke="${dimColor}" stroke-width="1"/>`,
    `<text x="${(X(0) + X(wallW)) / 2}" y="${dimY - 6}" font-size="14" font-weight="bold" text-anchor="middle" fill="${dimColor}">WALL ${wallW}&quot;</text>`,
  );
  // Overall wall height dimension (left)
  const hDimX = X(0) - 64;
  parts.push(
    `<line x1="${X(0) - 8}" y1="${Y(wallH)}" x2="${hDimX - 6}" y2="${Y(wallH)}" stroke="${dimColor}" stroke-width="1"/>`,
    `<line x1="${X(0) - 8}" y1="${Y(0)}" x2="${hDimX - 6}" y2="${Y(0)}" stroke="${dimColor}" stroke-width="1"/>`,
    `<line x1="${hDimX}" y1="${Y(wallH)}" x2="${hDimX}" y2="${Y(0)}" stroke="${dimColor}" stroke-width="1"/>`,
    `<text x="${hDimX - 8}" y="${(Y(wallH) + Y(0)) / 2}" font-size="14" font-weight="bold" text-anchor="middle" fill="${dimColor}" transform="rotate(-90 ${hDimX - 8} ${(Y(wallH) + Y(0)) / 2})">${wallH}&quot;</text>`,
  );

  // Elements
  packet.elements.forEach((el, i) => {
    const x = X(el.leftFromDatumIn);
    const y = Y(el.bottomAffIn + el.heightIn);
    const w = el.widthIn * scale;
    const h = el.heightIn * scale;
    const fill = i % 2 === 0 ? "#f2f2f2" : "#e8e8e8";
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${dimColor}" stroke-width="1.75"/>`,
    );
    const cx = x + w / 2;
    const cy = y + h / 2;
    const labelSize = Math.min(15, Math.max(10, w / Math.max(1, el.label.length) * 1.6));
    parts.push(
      `<text x="${cx}" y="${cy - 2}" font-size="${labelSize}" font-weight="bold" text-anchor="middle" fill="${dimColor}">${esc(el.label)}</text>`,
      `<text x="${cx}" y="${cy + 14}" font-size="11" text-anchor="middle" fill="#444">${el.widthIn}&quot; × ${el.heightIn}&quot;${el.depthIn ? ` × ${el.depthIn}&quot;D` : ""}</text>`,
    );
    // Width dim under element
    const ey = Y(el.bottomAffIn) + 18;
    parts.push(
      `<line x1="${x}" y1="${ey}" x2="${x + w}" y2="${ey}" stroke="#555" stroke-width="1"/>`,
      `<text x="${cx}" y="${ey + 13}" font-size="11" text-anchor="middle" fill="#333">${el.widthIn}&quot;</text>`,
    );
    // Bottom-height AFF dim (left of element)
    const hx = x - 10;
    parts.push(
      `<line x1="${hx}" y1="${Y(el.bottomAffIn)}" x2="${hx}" y2="${Y(0)}" stroke="#555" stroke-width="1" stroke-dasharray="4 3"/>`,
      `<text x="${hx - 5}" y="${(Y(el.bottomAffIn) + Y(0)) / 2}" font-size="10" text-anchor="end" fill="#333">${el.bottomAffIn}&quot; AFF</text>`,
    );
    // Horizontal position from left datum
    if (el.leftFromDatumIn > 0) {
      const hy = Y(0) + 34;
      parts.push(
        `<line x1="${X(0)}" y1="${hy}" x2="${x}" y2="${hy}" stroke="#555" stroke-width="1" stroke-dasharray="4 3"/>`,
        `<text x="${(X(0) + x) / 2}" y="${hy - 4}" font-size="10" text-anchor="middle" fill="#333">${el.leftFromDatumIn}&quot;</text>`,
      );
    }
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Shop elevation drawing">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`,
    ...parts,
    `</svg>`,
  ].join("\n");
}
