import { describe, it, expect } from 'vitest';
import { db, storage } from '../admin';
import { adminTestBenchGenerateDoc } from './testbench';

async function seedStyle() {
  await db.collection('styles').doc('scandi').set({
    slug: 'scandi', name: 'Scandinavian', description: 'Calm', galleryImages: [], sortOrder: 0, active: true,
    recipe: { description: 'd', materials: 'oak', palette: 'warm', furniture: 'low', avoid: 'clutter' },
  });
}

async function seedInputPhoto(path: string) {
  await storage.bucket().file(path).save(Buffer.from('x'), { contentType: 'image/jpeg' });
}

describe('adminTestBenchGenerateDoc', () => {
  it('generates from an existing style slug and writes a testbench generation doc', async () => {
    await seedStyle();
    await seedInputPhoto('testbench/in.jpg');
    const result = await adminTestBenchGenerateDoc({ inputPhotoPath: 'testbench/in.jpg', styleSlug: 'scandi' });
    expect(result.generationId).toBeTruthy();
    expect(result.outputPhotoPath).toBeTruthy();
    const snap = await db.collection('generations').doc(result.generationId).get();
    expect(snap.exists).toBe(true);
    const data = snap.data()!;
    expect(data.source).toBe('testbench');
    expect(data.styleSlug).toBe('scandi');
    expect(data.promptSnapshot).toMatch(/Scandinavian/);
    expect(data.outputPhotoPath).toBe(result.outputPhotoPath);
    expect(data.leadId).toBe('');
    expect(data.status).toBe('success');
  });

  it('generates from an inline recipe + styleName when no slug is given', async () => {
    await seedInputPhoto('testbench/in.jpg');
    const inlineRecipe = { description: 'd', materials: 'walnut', palette: 'cool', furniture: 'sleek', avoid: 'clutter' };
    const result = await adminTestBenchGenerateDoc({
      inputPhotoPath: 'testbench/in.jpg',
      inlineRecipe,
      styleName: 'Experimental Modern',
    });
    expect(result.generationId).toBeTruthy();
    const snap = await db.collection('generations').doc(result.generationId).get();
    const data = snap.data()!;
    expect(data.styleSlug).toBe('inline');
    expect(data.promptSnapshot).toMatch(/Experimental Modern/);
    expect(data.recipeSnapshot).toEqual(inlineRecipe);
  });

  it('throws invalid-argument when no styleSlug and no inlineRecipe are given', async () => {
    await seedInputPhoto('testbench/in.jpg');
    await expect(adminTestBenchGenerateDoc({ inputPhotoPath: 'testbench/in.jpg' })).rejects.toThrow(/invalid-argument|recipe|style/i);
  });

  it('throws invalid-argument for an unknown styleSlug', async () => {
    await seedInputPhoto('testbench/in.jpg');
    await expect(adminTestBenchGenerateDoc({ inputPhotoPath: 'testbench/in.jpg', styleSlug: 'nonexistent' })).rejects.toThrow();
  });
});
