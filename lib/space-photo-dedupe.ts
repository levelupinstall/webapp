import sharp from "sharp";

/** Decode `data:...;base64,...` into raw bytes. */
export function decodeDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  try {
    return { mime: m[1].trim(), buffer: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

/** 64-bit average hash as 16 hex chars (8×8 luminance vs mean). */
export async function averageHash64FromImageBuffer(buf: Buffer): Promise<string | null> {
  try {
    const raw = await sharp(buf)
      .resize(8, 8, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = raw.data;
    if (pixels.length !== 64) return null;
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += pixels[i]!;
    const mean = sum / 64;
    let bits = BigInt(0);
    for (let i = 0; i < 64; i++) {
      if (pixels[i]! >= mean) bits |= BigInt(1) << BigInt(i);
    }
    return bits.toString(16).padStart(16, "0");
  } catch {
    return null;
  }
}

export function hammingHex64(a: string, b: string): number {
  if (a.length !== 16 || b.length !== 16) return 999;
  let x: bigint;
  try {
    x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  } catch {
    return 999;
  }
  let n = 0;
  for (let i = 0; i < 64; i++) {
    if ((x >> BigInt(i)) & BigInt(1)) n++;
  }
  return n;
}

export type SpacePhotoLike = { type: "image" | "video"; url: string };

/**
 * If `candidateUrl` is a near-duplicate of an existing image (perceptual hash), return its index.
 * Videos are compared by exact URL only (caller should handle).
 */
export async function findDuplicateSpacePhotoIndex(
  existing: SpacePhotoLike[],
  candidateUrl: string,
  candidateType: "image" | "video",
  opts?: { maxHamming?: number },
): Promise<number | null> {
  const maxHamming = opts?.maxHamming ?? 10;
  if (candidateType === "video") {
    const i = existing.findIndex((e) => e.type === "video" && e.url === candidateUrl);
    return i >= 0 ? i : null;
  }
  const cand = decodeDataUrl(candidateUrl);
  if (!cand || !cand.mime.startsWith("image/")) return null;
  const candHash = await averageHash64FromImageBuffer(cand.buffer);
  if (!candHash) return null;

  for (let i = 0; i < existing.length; i++) {
    const e = existing[i]!;
    if (e.type !== "image") continue;
    if (e.url === candidateUrl) return i;
    const prev = decodeDataUrl(e.url);
    if (!prev || !prev.mime.startsWith("image/")) continue;
    const h = await averageHash64FromImageBuffer(prev.buffer);
    if (!h) continue;
    if (hammingHex64(candHash, h) <= maxHamming) return i;
  }
  return null;
}

/** Closest prior image by perceptual hash distance (for ambiguous AI confirmation). */
export async function findClosestImageHammingDistance(
  existing: SpacePhotoLike[],
  candidateUrl: string,
): Promise<{ index: number; distance: number } | null> {
  const cand = decodeDataUrl(candidateUrl);
  if (!cand || !cand.mime.startsWith("image/")) return null;
  const candHash = await averageHash64FromImageBuffer(cand.buffer);
  if (!candHash) return null;
  let best: { index: number; distance: number } | null = null;
  for (let i = 0; i < existing.length; i++) {
    const e = existing[i]!;
    if (e.type !== "image") continue;
    const prev = decodeDataUrl(e.url);
    if (!prev || !prev.mime.startsWith("image/")) continue;
    const h = await averageHash64FromImageBuffer(prev.buffer);
    if (!h) continue;
    const d = hammingHex64(candHash, h);
    if (!best || d < best.distance) best = { index: i, distance: d };
  }
  return best;
}
