import type { Style } from '../../../src/domain/types';

/**
 * Builds a tiny, deterministic, offline-safe placeholder image for a style's
 * gallery: an inline SVG rendered as a data URI. No network access, no
 * external image host — safe to seed in tests, CI, and emulators without
 * ever making an outbound request.
 *
 * Real portfolio photos replace these via the admin UI in Phase 2.
 */
function placeholderImage(bg: string, accent: string, label: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='360'>` +
    `<rect width='480' height='360' fill='${bg}'/>` +
    `<rect x='24' y='24' width='432' height='312' fill='none' stroke='${accent}' stroke-width='4'/>` +
    `<text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' ` +
    `font-family='Helvetica, Arial, sans-serif' font-size='28' fill='${accent}'>${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const STYLES: Style[] = [
  {
    slug: 'scandi',
    name: 'Scandinavian',
    description: 'Light, airy, and functional — pale woods, soft textiles, and uncluttered calm.',
    galleryImages: [
      placeholderImage('#f5f1ea', '#8c7a63', 'Scandinavian 1'),
      placeholderImage('#eef0ee', '#5c6b5a', 'Scandinavian 2'),
      placeholderImage('#f7f4ee', '#a3a3a3', 'Scandinavian 3'),
    ],
    recipe: {
      description: 'Bright, minimal, and cozy: pale wood tones, layered natural textiles, and a restful, uncluttered feel.',
      materials: 'whitewashed and pale oak, boucle and wool textiles, matte white ceramics, light rattan accents',
      palette: 'soft whites and warm greys with pale wood tones and gentle sage or dusty blue accents',
      furniture: 'low-profile sofas with tapered wooden legs, simple slatted chairs, functional storage with clean lines',
      avoid: 'no ornate carving, no heavy dark woods, no dense clutter, no bold saturated colors',
    },
    sortOrder: 0,
    active: true,
  },
  {
    slug: 'japandi',
    name: 'Japandi',
    description: 'Japanese restraint meets Scandinavian warmth — quiet, grounded, and intentional.',
    galleryImages: [
      placeholderImage('#eae4d8', '#3f3a34', 'Japandi 1'),
      placeholderImage('#e5ded0', '#6b5b46', 'Japandi 2'),
      placeholderImage('#efe9dd', '#2f2f2f', 'Japandi 3'),
    ],
    recipe: {
      description: 'A calm fusion of Japanese minimalism and Scandinavian warmth: natural materials, low furniture, and quiet negative space.',
      materials: 'dark and light oiled woods, linen and hemp textiles, matte black metal, unglazed stoneware',
      palette: 'warm neutrals, charcoal, and clay tones grounded by soft off-whites',
      furniture: 'low-slung platform seating, tatami-inspired lines, tapered wood legs, minimal hardware',
      avoid: 'no ornamentation, no glossy finishes, no bright or neon colors, no visual clutter',
    },
    sortOrder: 1,
    active: true,
  },
  {
    slug: 'mid_century',
    name: 'Mid-Century Modern',
    description: 'Sculptural silhouettes, warm walnut, and confident color from the 1950s–60s revisited.',
    galleryImages: [
      placeholderImage('#e3c396', '#7a3b2e', 'Mid-Century 1'),
      placeholderImage('#d9a066', '#2e4034', 'Mid-Century 2'),
      placeholderImage('#e8b96a', '#1f1f1f', 'Mid-Century 3'),
    ],
    recipe: {
      description: 'Warm walnut tones, sculptural silhouettes, and confident retro color inspired by 1950s–60s design.',
      materials: 'warm walnut and teak wood, tan and cognac leather, brass hardware, bouclé upholstery',
      palette: 'mustard, burnt orange, and avocado green accents against warm wood and cream',
      furniture: 'tapered peg legs, low sideboards, egg-shaped or tub chairs, sculptural pendant lighting',
      avoid: 'no farmhouse or shabby-chic details, no cold industrial metal, no pastel palettes',
    },
    sortOrder: 2,
    active: true,
  },
  {
    slug: 'modern_farmhouse',
    name: 'Modern Farmhouse',
    description: 'Crisp whites, reclaimed wood, and black metal accents — cozy and welcoming.',
    galleryImages: [
      placeholderImage('#f5f2ec', '#2b2b2b', 'Modern Farmhouse 1'),
      placeholderImage('#efe9df', '#4a4038', 'Modern Farmhouse 2'),
      placeholderImage('#faf7f1', '#5c4a3a', 'Modern Farmhouse 3'),
    ],
    recipe: {
      description: 'A cozy, welcoming blend of crisp whites, reclaimed wood, and black metal accents with rustic-but-clean lines.',
      materials: 'reclaimed and shiplap wood, matte black iron, woven cotton and jute, white-painted millwork',
      palette: 'crisp white and warm cream with charcoal-black accents and natural wood tones',
      furniture: 'slipcovered sofas, turned wood legs, farmhouse tables, black metal light fixtures',
      avoid: 'no glossy modern finishes, no chrome, no bright saturated colors, no overly ornate trim',
    },
    sortOrder: 3,
    active: true,
  },
  {
    slug: 'boho',
    name: 'Warm Boho',
    description: 'Layered textiles, sun-warmed color, and natural texture for a relaxed, collected look.',
    galleryImages: [
      placeholderImage('#e3b98a', '#8a3324', 'Warm Boho 1'),
      placeholderImage('#dba05f', '#5a3e2b', 'Warm Boho 2'),
      placeholderImage('#e8c9a0', '#6b4226', 'Warm Boho 3'),
    ],
    recipe: {
      description: 'A relaxed, collected layering of natural texture, sun-warmed color, and global-inspired pattern.',
      materials: 'rattan and woven cane, jute and macrame, warm terracotta ceramics, natural linen',
      palette: 'terracotta, rust, and mustard warmed by sandy neutrals and deep plum accents',
      furniture: 'low rattan chairs, floor cushions, rounded wood coffee tables, layered textured rugs',
      avoid: 'no cold minimalism, no glossy chrome or glass, no stark monochrome palettes',
    },
    sortOrder: 4,
    active: true,
  },
  {
    slug: 'coastal',
    name: 'Coastal Calm',
    description: 'Breezy blues, driftwood textures, and natural light for an easy seaside feel.',
    galleryImages: [
      placeholderImage('#eef4f5', '#3a6b78', 'Coastal Calm 1'),
      placeholderImage('#e6f0ef', '#2e4a52', 'Coastal Calm 2'),
      placeholderImage('#f2f7f6', '#5c8a91', 'Coastal Calm 3'),
    ],
    recipe: {
      description: 'A breezy, sunlit seaside feel built from driftwood textures, soft blues, and natural fibers.',
      materials: 'whitewashed and driftwood-toned wood, woven seagrass, linen slipcovers, light rope accents',
      palette: 'soft white and sandy neutrals with breezy blue-green accents',
      furniture: 'slipcovered relaxed-fit sofas, woven seagrass chairs, weathered wood tables',
      avoid: 'no dark heavy woods, no formal or ornate details, no saturated jewel tones',
    },
    sortOrder: 5,
    active: true,
  },
  {
    slug: 'industrial',
    name: 'Soft Industrial',
    description: 'Raw materials softened with warmth — exposed textures balanced by comfort.',
    galleryImages: [
      placeholderImage('#d9d4cb', '#2a2a2a', 'Soft Industrial 1'),
      placeholderImage('#c9c2b6', '#403a34', 'Soft Industrial 2'),
      placeholderImage('#e0dbd0', '#1f1f1f', 'Soft Industrial 3'),
    ],
    recipe: {
      description: 'Raw, exposed materials balanced with warm textiles and soft lighting so the look feels lived-in, not cold.',
      materials: 'blackened steel, reclaimed wood, exposed brick texture, aged leather, warm wool throws',
      palette: 'charcoal and warm grey with rust and camel leather accents against a soft cream base',
      furniture: 'leather sofas with metal frames, pipe-leg tables, factory-style pendant lighting softened with warm shades',
      avoid: 'no cold sterile whites, no glossy finishes, no delicate ornate furniture',
    },
    sortOrder: 6,
    active: true,
  },
  {
    slug: 'traditional',
    name: 'Updated Traditional',
    description: 'Classic proportions and comfort refreshed with a lighter, more current touch.',
    galleryImages: [
      placeholderImage('#f0ece3', '#5b4636', 'Updated Traditional 1'),
      placeholderImage('#e9e2d3', '#3f5646', 'Updated Traditional 2'),
      placeholderImage('#f4efe4', '#7a3b3b', 'Updated Traditional 3'),
    ],
    recipe: {
      description: 'Classic, comfortable proportions refreshed with a lighter palette and more current, less fussy details.',
      materials: 'warm stained wood, tailored linen and cotton upholstery, brushed brass, subtle molding',
      palette: 'soft cream and warm taupe with muted navy, sage, or brick accents',
      furniture: 'rolled-arm sofas, turned wood legs, symmetrical layouts, classic silhouettes with cleaner lines',
      avoid: 'no heavy dark florals, no ornate gilding, no overly formal or stiff arrangements',
    },
    sortOrder: 7,
    active: true,
  },
];
