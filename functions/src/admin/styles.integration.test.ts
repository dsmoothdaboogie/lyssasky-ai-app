import { describe, it, expect } from 'vitest';
import { db } from '../admin';
import { adminSaveStyleDoc, adminDeleteStyleDoc, validateStyle } from './styles';

const style = {
  slug: 'teststyle', name: 'Test Style', description: 'd', galleryImages: ['data:image/svg+xml,x'],
  recipe: { description: 'd', materials: 'm', palette: 'p', furniture: 'f', avoid: 'a' },
  sortOrder: 9, active: true,
};

describe('admin styles', () => {
  it('upserts a valid style', async () => {
    await adminSaveStyleDoc(validateStyle(style));
    const snap = await db.collection('styles').doc('teststyle').get();
    expect(snap.data()!.name).toBe('Test Style');
  });
  it('updates an existing style by slug', async () => {
    await adminSaveStyleDoc(validateStyle({ ...style, name: 'Renamed' }));
    const snap = await db.collection('styles').doc('teststyle').get();
    expect(snap.data()!.name).toBe('Renamed');
  });
  it('deletes a style', async () => {
    await adminDeleteStyleDoc('teststyle');
    const snap = await db.collection('styles').doc('teststyle').get();
    expect(snap.exists).toBe(false);
  });
  it('rejects a style missing a slug', () => {
    expect(() => validateStyle({ ...style, slug: '' })).toThrow(/slug/i);
  });
  it('rejects a style missing recipe fields', () => {
    expect(() => validateStyle({ ...style, recipe: { description: 'd' } })).toThrow(/recipe/i);
  });
});
