import { describe, it, expect } from 'vitest';
import { db } from './admin';
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
  it('returns status and imagePaths for a matching token', async () => {
    const ref = db.collection('leads').doc();
    await seedLead(ref.id);

    const result = await getResultByTokenDoc(ref.id, 't1');

    expect(result.status).toBe('generated');
    expect(result.imagePaths).toEqual(['leads/u1/generated/1.png']);
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
