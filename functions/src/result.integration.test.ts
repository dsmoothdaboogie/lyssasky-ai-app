import { describe, it, expect } from 'vitest';
import { db, storage } from './admin';
import { getResultByTokenDoc } from './result';
import { createLeadDoc } from './leads';
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

  it('returns labeled looks, pass and perk — even after the pass expired', async () => {
    const { leadId, leadToken } = await createLeadDoc('tok-owner');
    const p1 = 'leads/tok-owner/generated/a.png';
    const p2 = 'leads/tok-owner/generated/b.png';
    for (const p of [p1, p2]) await storage.bucket().file(p).save(Buffer.from('png'), { contentType: 'image/png' });
    await db.collection('leads').doc(leadId).update({
      status: 'rated',
      generatedImagePaths: [p1, p2],
      looks: [
        { imagePath: p1, styleSlug: 'scandi', colorMood: 'warm_cozy', createdAt: 1 },
        { imagePath: p2, styleSlug: 'japandi', colorMood: 'light_airy', createdAt: 2 },
      ],
      pass: { restylesTotal: 5, restylesUsed: 1, expiresAt: Date.now() - 1, inFlight: 123 },
      perk: { code: 'ROOM-ABCD', discountPct: 10, validUntil: Date.now() + 1000 },
    });
    const res = await getResultByTokenDoc(leadId, leadToken);
    expect(res.looks.map((l) => l.styleSlug)).toEqual(['scandi', 'japandi']);
    expect(res.looks[1].url).toContain('alt=media');
    expect(res.pass).toEqual({ restylesTotal: 5, restylesUsed: 1, expiresAt: expect.any(Number) });
    expect(res.perk!.code).toBe('ROOM-ABCD');
  });

  it('returns empty looks and null pass/perk for a legacy lead', async () => {
    const { leadId, leadToken } = await createLeadDoc('tok-legacy');
    const res = await getResultByTokenDoc(leadId, leadToken);
    expect(res.looks).toEqual([]);
    expect(res.pass).toBeNull();
    expect(res.perk).toBeNull();
  });
});
