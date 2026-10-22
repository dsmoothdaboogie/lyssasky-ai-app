import { describe, it, expect, beforeEach } from 'vitest';
import { db, storage } from './admin';
import { createLeadDoc } from './leads';
import { restyleDoc } from './restyle';
import { DAY_MS, IN_FLIGHT_STALE_MS } from '../../src/domain/pass';
import type { GenerationProvider } from './generation/provider';
import type { Lead } from '../../src/domain/types';

const answers = { roomType: 'living_room', styleSlug: 'scandi', colorMood: 'warm_cozy', budget: '1k_5k', timeline: 'asap' };

async function seedStyles() {
  for (const [slug, name, active] of [['scandi', 'Scandinavian', true], ['japandi', 'Japandi', true], ['retired', 'Retired', false]] as const) {
    await db.collection('styles').doc(slug).set({
      slug, name, description: '', galleryImages: [], sortOrder: 0, active,
      recipe: { description: 'd', materials: 'm', palette: 'p', furniture: 'f', avoid: 'a' },
    });
  }
}

async function seedPassLead(ownerUid: string, overrides: Partial<Lead> = {}) {
  const { leadId } = await createLeadDoc(ownerUid);
  const originalPhotoPath = `leads/${ownerUid}/${leadId}/original.jpg`;
  await storage.bucket().file(originalPhotoPath).save(Buffer.from('fakejpeg'), { contentType: 'image/jpeg' });
  const now = Date.now();
  await db.collection('leads').doc(leadId).update({
    status: 'generated', answers, originalPhotoPath,
    generatedImagePaths: ['leads/x/generated/first.png'],
    looks: [{ imagePath: 'leads/x/generated/first.png', styleSlug: 'scandi', colorMood: 'warm_cozy', createdAt: now }],
    pass: { restylesTotal: 5, restylesUsed: 0, expiresAt: now + 7 * DAY_MS },
    perk: { code: 'ROOM-TEST', discountPct: 10, validUntil: now + 30 * DAY_MS },
    ...overrides,
  });
  return leadId;
}

const read = async (id: string) => (await db.collection('leads').doc(id).get()).data() as Lead;
const failing: GenerationProvider = { async generate() { throw new Error('boom'); } };

beforeEach(seedStyles);

describe('restyleDoc', () => {
  it('generates a new look with the chosen style/mood and consumes one restyle', async () => {
    const id = await seedPassLead('r1');
    const res = await restyleDoc(id, 'r1', { styleSlug: 'japandi', colorMood: 'light_airy' });
    const lead = await read(id);
    expect(res.restylesLeft).toBe(4);
    expect(lead.pass!.restylesUsed).toBe(1);
    expect(lead.pass!.inFlight).toBeUndefined();
    expect(lead.looks).toHaveLength(2);
    expect(lead.looks![1]).toMatchObject({ imagePath: res.imagePath, styleSlug: 'japandi', colorMood: 'light_airy' });
    expect(lead.generatedImagePaths).toHaveLength(2);
    expect(lead.status).toBe('generated');
    // answers are NOT rewritten — the restyle is an override, not a new questionnaire
    expect(lead.answers!.styleSlug).toBe('scandi');
    const gens = await db.collection('generations').where('leadId', '==', id).get();
    expect(gens.docs.map((d) => d.data().styleSlug)).toContain('japandi');
  });

  it('does not change status for rated or booked leads', async () => {
    for (const status of ['rated', 'booked'] as const) {
      const id = await seedPassLead(`r-${status}`, { status });
      await restyleDoc(id, `r-${status}`, { styleSlug: 'japandi', colorMood: 'warm_cozy' });
      expect((await read(id)).status).toBe(status);
    }
  });

  it('rejects a non-owner', async () => {
    const id = await seedPassLead('r2');
    await expect(restyleDoc(id, 'intruder', { styleSlug: 'japandi', colorMood: 'warm_cozy' })).rejects.toThrow(/permission/i);
  });

  it('rejects unknown or inactive styles and unknown moods', async () => {
    const id = await seedPassLead('r3');
    await expect(restyleDoc(id, 'r3', { styleSlug: 'nope', colorMood: 'warm_cozy' })).rejects.toThrow(/style isn't available/);
    await expect(restyleDoc(id, 'r3', { styleSlug: 'retired', colorMood: 'warm_cozy' })).rejects.toThrow(/style isn't available/);
    await expect(restyleDoc(id, 'r3', { styleSlug: 'japandi', colorMood: 'neon' })).rejects.toThrow(/color mood isn't available/);
    expect((await read(id)).pass!.restylesUsed).toBe(0);
  });

  it('rejects when exhausted', async () => {
    const id = await seedPassLead('r4', { pass: { restylesTotal: 5, restylesUsed: 5, expiresAt: Date.now() + DAY_MS } });
    await expect(restyleDoc(id, 'r4', { styleSlug: 'japandi', colorMood: 'warm_cozy' })).rejects.toThrow(/used all your restyles/);
  });

  it('rejects when expired, and for legacy leads with no pass', async () => {
    const expired = await seedPassLead('r5', { pass: { restylesTotal: 5, restylesUsed: 0, expiresAt: Date.now() - 1 } });
    await expect(restyleDoc(expired, 'r5', { styleSlug: 'japandi', colorMood: 'warm_cozy' })).rejects.toThrow(/Room Pass has ended/);
    const legacy = await seedPassLead('r6');
    await db.collection('leads').doc(legacy).update({ pass: null });
    await expect(restyleDoc(legacy, 'r6', { styleSlug: 'japandi', colorMood: 'warm_cozy' })).rejects.toThrow(/Room Pass has ended/);
  });

  it('rejects before the first preview exists', async () => {
    const id = await seedPassLead('r7', { status: 'paid', generatedImagePaths: [], looks: [] });
    await expect(restyleDoc(id, 'r7', { styleSlug: 'japandi', colorMood: 'warm_cozy' })).rejects.toThrow(/first look is still on its way/);
  });

  it('refunds the restyle and keeps status when generation fails', async () => {
    const id = await seedPassLead('r8');
    await expect(restyleDoc(id, 'r8', { styleSlug: 'japandi', colorMood: 'warm_cozy' }, { provider: failing }))
      .rejects.toThrow(/wasn't used/);
    const lead = await read(id);
    expect(lead.pass!.restylesUsed).toBe(0);
    expect(lead.pass!.inFlight).toBeUndefined();
    expect(lead.status).toBe('generated');
    expect(lead.looks).toHaveLength(1);
    const failed = await db.collection('generations').where('leadId', '==', id).where('status', '==', 'failed').get();
    expect(failed.size).toBe(1);
  });

  it('refunds the restyle when the provider hangs past the per-attempt timeout', async () => {
    const id = await seedPassLead('r8b');
    const hanging: GenerationProvider = { generate: () => new Promise(() => {}) };
    await expect(restyleDoc(id, 'r8b', { styleSlug: 'japandi', colorMood: 'warm_cozy' }, { provider: hanging, attemptTimeoutMs: 20 }))
      .rejects.toThrow(/wasn't used/);
    const lead = await read(id);
    expect(lead.pass!.restylesUsed).toBe(0);
    expect(lead.pass!.inFlight).toBeUndefined();
  });

  it('lets exactly one of two concurrent restyles run', async () => {
    const id = await seedPassLead('r9');
    const results = await Promise.allSettled([
      restyleDoc(id, 'r9', { styleSlug: 'japandi', colorMood: 'warm_cozy' }),
      restyleDoc(id, 'r9', { styleSlug: 'japandi', colorMood: 'light_airy' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/already being generated/);
    const lead = await read(id);
    expect(lead.pass!.restylesUsed).toBe(1);
    expect(lead.looks).toHaveLength(2);
  });

  it('ignores a stale inFlight marker from a crashed run', async () => {
    const now = Date.now();
    const id = await seedPassLead('r10', {
      pass: { restylesTotal: 5, restylesUsed: 1, expiresAt: now + DAY_MS, inFlight: now - IN_FLIGHT_STALE_MS - 1 },
    });
    await restyleDoc(id, 'r10', { styleSlug: 'japandi', colorMood: 'warm_cozy' });
    expect((await read(id)).pass!.restylesUsed).toBe(2);
  });

  it('lets an admin restyle a lead they do not own', async () => {
    const id = await seedPassLead('r11');
    await restyleDoc(id, 'admin-uid', { styleSlug: 'japandi', colorMood: 'warm_cozy' }, { isAdmin: true });
    expect((await read(id)).looks).toHaveLength(2);
  });
});
