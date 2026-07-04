import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../admin';
import { assertAdmin } from '../guards';
import type { Style, StyleRecipe } from '../../../src/domain/types';

const SLUG_RE = /^[a-z0-9_]+$/;
function str(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new HttpsError('invalid-argument', `Missing ${field}`);
  return v;
}
export function validateStyle(input: unknown): Style {
  const s = input as Record<string, unknown>;
  const slug = str(s.slug, 'slug');
  if (!SLUG_RE.test(slug)) throw new HttpsError('invalid-argument', 'slug must be lowercase letters, numbers, underscores');
  const r = (s.recipe ?? {}) as Record<string, unknown>;
  const recipe: StyleRecipe = {
    description: str(r.description, 'recipe.description'),
    materials: str(r.materials, 'recipe.materials'),
    palette: str(r.palette, 'recipe.palette'),
    furniture: str(r.furniture, 'recipe.furniture'),
    avoid: str(r.avoid, 'recipe.avoid'),
  };
  const galleryImages = Array.isArray(s.galleryImages) ? s.galleryImages.filter((x): x is string => typeof x === 'string') : [];
  return {
    slug, name: str(s.name, 'name'), description: str(s.description, 'description'),
    galleryImages, recipe,
    sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : 0,
    active: s.active !== false,
  };
}
export async function adminSaveStyleDoc(style: Style): Promise<void> {
  await db.collection('styles').doc(style.slug).set(style);
}
export async function adminDeleteStyleDoc(slug: string): Promise<void> {
  await db.collection('styles').doc(slug).delete();
}
export const adminSaveStyle = onCall(async (req) => {
  assertAdmin(req.auth);
  await adminSaveStyleDoc(validateStyle(req.data?.style));
  return { ok: true };
});
export const adminDeleteStyle = onCall(async (req) => {
  assertAdmin(req.auth);
  const slug = req.data?.slug;
  if (typeof slug !== 'string' || !slug) throw new HttpsError('invalid-argument', 'slug required');
  await adminDeleteStyleDoc(slug);
  return { ok: true };
});
