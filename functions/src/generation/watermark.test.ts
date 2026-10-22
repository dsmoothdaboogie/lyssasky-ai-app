import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { applyWatermark, MIN_WATERMARK_WIDTH } from './watermark';
import { PLACEHOLDER_PNG_BASE64 } from './placeholder';

async function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#808080' } }).png().toBuffer();
}

describe('applyWatermark', () => {
  it('keeps dimensions and changes the bottom-right pixels', async () => {
    const input = await solid(1000, 750);
    const out = await applyWatermark(input);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(750);
    const corner = await sharp(out).extract({ left: 700, top: 660, width: 260, height: 60 }).raw().toBuffer();
    const original = await sharp(input).extract({ left: 700, top: 660, width: 260, height: 60 }).raw().toBuffer();
    expect(corner.equals(original)).toBe(false);
    const topLeft = await sharp(out).extract({ left: 0, top: 0, width: 50, height: 50 }).raw().toBuffer();
    const topLeftOrig = await sharp(input).extract({ left: 0, top: 0, width: 50, height: 50 }).raw().toBuffer();
    expect(topLeft.equals(topLeftOrig)).toBe(true);
  });

  it('returns tiny images (e.g. the 1x1 mock output) unchanged', async () => {
    const tiny = Buffer.from(PLACEHOLDER_PNG_BASE64, 'base64');
    expect((await applyWatermark(tiny)).equals(tiny)).toBe(true);
    const small = await solid(MIN_WATERMARK_WIDTH - 1, 100);
    expect((await applyWatermark(small)).equals(small)).toBe(true);
  });

  it('throws on bytes that are not an image', async () => {
    await expect(applyWatermark(Buffer.from('not an image'))).rejects.toThrow();
  });
});
