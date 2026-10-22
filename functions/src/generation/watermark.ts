import sharp from 'sharp';
import path from 'node:path';
import { readFileSync } from 'node:fs';

/** Below this width there's nothing meaningful to mark (and the mock 1x1 PNG must pass through). */
export const MIN_WATERMARK_WIDTH = 200;

// lib/functions/src/generation/ -> ../../../../assets ; src/generation/ -> ../../assets
function loadMark(): Buffer {
  const candidates = [
    path.join(__dirname, '..', '..', 'assets', 'watermark.png'),
    path.join(__dirname, '..', '..', '..', '..', 'assets', 'watermark.png'),
  ];
  for (const p of candidates) {
    try { return readFileSync(p); } catch { /* try next */ }
  }
  throw new Error('watermark.png not found');
}

let markBytes: Buffer | undefined;

/**
 * Composites the "Preview by Lyssasky" mark into the bottom-right corner at
 * ~28% of the image width. Throws on failure — the caller decides whether a
 * missing watermark is fatal (it isn't, see generateImage).
 */
export async function applyWatermark(bytes: Buffer): Promise<Buffer> {
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < MIN_WATERMARK_WIDTH) return bytes;

  markBytes ??= loadMark();
  const markWidth = Math.round(width * 0.28);
  const mark = await sharp(markBytes).resize({ width: markWidth }).png().toBuffer();
  const markHeight = (await sharp(mark).metadata()).height ?? 0;
  const margin = Math.round(width * 0.02);

  const composed = sharp(bytes).composite([
    { input: mark, left: width - markWidth - margin, top: Math.max(0, height - markHeight - margin) },
  ]);
  // The mark has an alpha channel; don't leak it into an opaque source image.
  return (meta.hasAlpha ? composed : composed.removeAlpha()).png().toBuffer();
}
