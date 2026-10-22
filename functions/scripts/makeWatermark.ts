// One-off: renders the "Preview by Lyssasky" watermark to assets/watermark.png.
// Run locally (needs system fonts): npx tsx scripts/makeWatermark.ts
// The PNG is committed so Cloud Functions never renders text at runtime.
import sharp from 'sharp';
import path from 'node:path';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="120">
  <rect x="0" y="0" width="640" height="120" rx="24" fill="#000" fill-opacity="0.35"/>
  <text x="320" y="78" font-family="Georgia, 'Times New Roman', serif" font-size="52"
        fill="#fff" fill-opacity="0.92" text-anchor="middle">Preview by Lyssasky</text>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile(path.join(__dirname, '..', 'assets', 'watermark.png'))
  .then(() => console.log('wrote assets/watermark.png'));
