import { describe, it, expect } from 'vitest';
import { db, storage } from '../admin';
import { runGeneration } from './runGeneration';
import { createMockGenerationProvider } from './mockProvider';
import type { GenerationProvider } from './provider';

async function seedStyle() {
  await db.collection('styles').doc('scandi').set({
    slug: 'scandi', name: 'Scandinavian', description: 'Calm', galleryImages: [], sortOrder: 0, active: true,
    recipe: { description: 'd', materials: 'oak', palette: 'warm', furniture: 'low', avoid: 'clutter' },
  });
}

async function seedOriginalPhoto(path: string) {
  await storage.bucket().file(path).save(Buffer.from('fakejpeg'), { contentType: 'image/jpeg' });
}

describe('runGeneration', () => {
  it('produces an image and advances the lead to generated', async () => {
    await seedStyle();
    const ref = db.collection('leads').doc();
    await ref.set({
      id: ref.id, ownerUid: 'u1', leadToken: 't', status: 'paid',
      answers: { roomType: 'living_room', styleSlug: 'scandi', colorMood: 'warm_cozy', budget: '1k_5k', timeline: 'asap' },
      originalPhotoPath: 'leads/u1/original.jpg',
      generatedImagePaths: [], costEstimateTotal: 0, timestamps: {}, createdAt: 0, updatedAt: 0,
    });
    await seedOriginalPhoto('leads/u1/original.jpg');
    await runGeneration(ref.id, createMockGenerationProvider());
    const lead = (await ref.get()).data()!;
    expect(lead.status).toBe('generated');
    expect(lead.generatedImagePaths).toHaveLength(1);
    const gens = await db.collection('generations').where('leadId', '==', ref.id).get();
    expect(gens.size).toBe(1);
    expect(gens.docs[0].data().promptSnapshot).toMatch(/Scandinavian/);
    expect(gens.docs[0].data().recipeSnapshot).toEqual({
      description: 'd', materials: 'oak', palette: 'warm', furniture: 'low', avoid: 'clutter',
    });
  });

  it('retries once then marks the lead failed if the provider keeps throwing', async () => {
    await seedStyle();
    const ref = db.collection('leads').doc();
    await ref.set({
      id: ref.id, ownerUid: 'u2', leadToken: 't2', status: 'paid',
      answers: { roomType: 'living_room', styleSlug: 'scandi', colorMood: 'warm_cozy', budget: '1k_5k', timeline: 'asap' },
      originalPhotoPath: 'leads/u2/original.jpg',
      generatedImagePaths: [], costEstimateTotal: 0, timestamps: {}, createdAt: 0, updatedAt: 0,
    });
    await seedOriginalPhoto('leads/u2/original.jpg');
    let callCount = 0;
    const alwaysFailingProvider: GenerationProvider = {
      async generate() {
        callCount++;
        throw new Error('provider exploded');
      },
    };
    await runGeneration(ref.id, alwaysFailingProvider);
    expect(callCount).toBe(2);
    const lead = (await ref.get()).data()!;
    expect(lead.status).toBe('failed');
    expect(lead.timestamps.failed).toBeGreaterThan(0);
    expect(lead.generatedImagePaths).toHaveLength(0);
    const gens = await db.collection('generations').where('leadId', '==', ref.id).get();
    expect(gens.size).toBe(1);
    expect(gens.docs[0].data().status).toBe('failed');
    expect(gens.docs[0].data().error).toMatch(/provider exploded/);
  });

  it('marks the lead failed (without throwing) when the styleSlug has no matching style doc', async () => {
    const ref = db.collection('leads').doc();
    await ref.set({
      id: ref.id, ownerUid: 'u3', leadToken: 't3', status: 'paid',
      answers: { roomType: 'living_room', styleSlug: 'nonexistent-style', colorMood: 'warm_cozy', budget: '1k_5k', timeline: 'asap' },
      originalPhotoPath: 'leads/u3/original.jpg',
      generatedImagePaths: [], costEstimateTotal: 0, timestamps: {}, createdAt: 0, updatedAt: 0,
    });
    await seedOriginalPhoto('leads/u3/original.jpg');
    await expect(runGeneration(ref.id, createMockGenerationProvider())).resolves.toBeUndefined();
    const lead = (await ref.get()).data()!;
    expect(lead.status).toBe('failed');
    expect(lead.timestamps.failed).toBeGreaterThan(0);
    const gens = await db.collection('generations').where('leadId', '==', ref.id).get();
    expect(gens.size).toBe(1);
    expect(gens.docs[0].data().status).toBe('failed');
    expect(gens.docs[0].data().error).toMatch(/Unknown style/);
  });
});
