import { describe, it, expect } from 'vitest';
import { db, storage } from './admin';
import { getResultByTokenDoc } from './result';
import type { Lead } from '../../src/domain/types';

async function seedLead(id: string, overrides: Partial<Lead> = {}): Promise<void> {
  const lead: Lead = {
    id, ownerUid: 'u1', leadToken: 't1', status: 'generated',
    generatedImagePaths: ['leads/u1/generated/1.png'],
    costEstimateTotal: 0, timestamps: {}, createdAt: 0, updatedAt: 0,
    ...overrides,
  };
  await db.collection('leads').doc(id).set(lead);
}

describe('getResultByTokenDoc', () => {
  it('returns status and resolved image URLs for a matching token', async () => {
    const ref = db.collection('leads').doc();
    await seedLead(ref.id);
    // The generated image path is resolved server-side via the Admin SDK
    // (bypassing storage.rules), so it must actually exist in Storage for
    // that resolution to succeed — same pattern as the runGeneration tests.
    await storage
      .bucket()
      .file('leads/u1/generated/1.png')
      .save(Buffer.from('fakepng'), { contentType: 'image/png' });

    const result = await getResultByTokenDoc(ref.id, 't1');

    expect(result.status).toBe('generated');
    expect(result.imageUrls).toHaveLength(1);
    expect(result.imageUrls[0]).toMatch(/^http/);
  });

  it('throws permission-denied for a wrong token', async () => {
    const ref = db.collection('leads').doc();
    await seedLead(ref.id);

    await expect(getResultByTokenDoc(ref.id, 'wrong-token')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('throws permission-denied for a missing lead', async () => {
    await expect(getResultByTokenDoc('does-not-exist', 't1')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
