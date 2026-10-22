import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../admin';
import { computeAnalytics } from './analytics';
import { DEFAULT_CONFIG } from '../../../src/config/defaultConfig';
import type { Lead, GenerationRecord } from '../../../src/domain/types';

async function clearCollection(name: string): Promise<void> {
  const snap = await db.collection(name).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

function makeLead(overrides: Partial<Lead>): Lead {
  const now = Date.now();
  return {
    id: overrides.id ?? db.collection('leads').doc().id,
    ownerUid: 'uid_analytics_test',
    leadToken: 'tok',
    status: 'captured',
    generatedImagePaths: [],
    costEstimateTotal: 0,
    timestamps: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeGeneration(overrides: Partial<GenerationRecord>): GenerationRecord {
  return {
    id: overrides.id ?? db.collection('generations').doc().id,
    leadId: 'lead_x',
    source: 'funnel',
    styleSlug: 'modern',
    recipeSnapshot: { description: 'd', materials: 'm', palette: 'p', furniture: 'f', avoid: 'a' },
    promptSnapshot: 'prompt',
    inputPhotoPath: 'in.jpg',
    durationMs: 1000,
    costEstimate: 0.1,
    status: 'success',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('computeAnalytics', () => {
  beforeAll(async () => {
    // The emulator persists data across other test files in the same run;
    // clear these two collections so our counts are deterministic. Also pin
    // config/app to DEFAULT_CONFIG, since config.integration.test.ts mutates
    // it (e.g. priceCents: 700) and that write persists across files.
    await clearCollection('leads');
    await clearCollection('generations');
    await db.collection('config').doc('app').set(DEFAULT_CONFIG);

    const leads: Lead[] = [
      makeLead({ status: 'captured', answers: undefined }),
      makeLead({ status: 'paid', answers: { roomType: 'living_room', styleSlug: 'modern', colorMood: 'warm_cozy', budget: '1k_5k', timeline: 'asap' } }),
      makeLead({ status: 'generated', answers: { roomType: 'bedroom', styleSlug: 'modern', colorMood: 'light_airy', budget: '1k_5k', timeline: 'within_3_months' } }),
      makeLead({ status: 'rated', rating: 4, answers: { roomType: 'kitchen', styleSlug: 'modern', colorMood: 'bold_dramatic', budget: '5k_15k', timeline: 'asap' } }),
      makeLead({ status: 'rated', rating: 2, answers: { roomType: 'office', styleSlug: 'coastal', colorMood: 'neutral_calm', budget: 'under_1k', timeline: 'just_dreaming' } }),
      makeLead({ status: 'booked', rating: 5, answers: { roomType: 'dining', styleSlug: 'coastal', colorMood: 'warm_cozy', budget: '5k_15k', timeline: 'asap' } }),
      makeLead({ status: 'booked', answers: { roomType: 'living_room', styleSlug: 'modern', colorMood: 'warm_cozy', budget: '1k_5k', timeline: 'asap' } }),
      makeLead({ status: 'failed', answers: { roomType: 'bedroom', styleSlug: 'minimalist', colorMood: 'neutral_calm', budget: 'over_15k', timeline: 'just_dreaming' } }),
    ];
    await Promise.all(leads.map((l) => db.collection('leads').doc(l.id).set(l)));

    const generations: GenerationRecord[] = [
      makeGeneration({ status: 'success', durationMs: 1000, costEstimate: 0.1 }),
      makeGeneration({ status: 'success', durationMs: 2000, costEstimate: 0.2 }),
      makeGeneration({ status: 'failed', durationMs: 500, costEstimate: 0.05 }),
    ];
    await Promise.all(generations.map((g) => db.collection('generations').doc(g.id).set(g)));
  });

  it('computes the funnel counts by lead status', async () => {
    const summary = await computeAnalytics();
    expect(summary.funnel).toEqual({
      captured: 1,
      paid: 1,
      generated: 1,
      rated: 2,
      booked: 2,
      failed: 1,
    });
    expect(summary.totalLeads).toBe(8);
  });

  it('ranks style popularity descending, with modern (4 leads) on top', async () => {
    const summary = await computeAnalytics();
    expect(summary.stylePopularity[0]).toEqual({ slug: 'modern', count: 4 });
    expect(summary.stylePopularity).toContainEqual({ slug: 'coastal', count: 2 });
    expect(summary.stylePopularity).toContainEqual({ slug: 'minimalist', count: 1 });
  });

  it('averages rating by style for rated leads only', async () => {
    const summary = await computeAnalytics();
    // modern: one rated lead with rating 4
    expect(summary.avgRatingByStyle).toContainEqual({ slug: 'modern', avg: 4, count: 1 });
    // coastal: ratings 2 and 5 -> avg 3.5, count 2
    expect(summary.avgRatingByStyle).toContainEqual({ slug: 'coastal', avg: 3.5, count: 2 });
    // minimalist has no rated lead, so it should not appear
    expect(summary.avgRatingByStyle.find((r) => r.slug === 'minimalist')).toBeUndefined();
  });

  it('builds budget and timeline distributions from answers', async () => {
    const summary = await computeAnalytics();
    expect(summary.budgetDistribution).toEqual({
      '1k_5k': 3,
      '5k_15k': 2,
      under_1k: 1,
      over_15k: 1,
    });
    expect(summary.timelineDistribution.asap).toBe(4);
    expect(summary.timelineDistribution.just_dreaming).toBe(2);
    expect(summary.timelineDistribution.within_3_months).toBe(1);
  });

  it('counts every lead that paid as revenue, including paid-then-failed leads', async () => {
    const summary = await computeAnalytics();
    // Every lead that reached payment counts — even one whose generation later
    // failed (the customer still paid): paid(1) + generated(1) + rated(2) +
    // booked(2) + failed(1) = 7. Only the pre-payment 'captured' lead is out.
    expect(summary.revenueCents).toBe(7 * DEFAULT_CONFIG.priceCents);
  });

  it('summarizes generations: total, failed, avgDurationMs, estCostCents', async () => {
    const summary = await computeAnalytics();
    expect(summary.generations.total).toBe(3);
    expect(summary.generations.failed).toBe(1);
    expect(summary.generations.avgDurationMs).toBeCloseTo((1000 + 2000 + 500) / 3);
    // (0.1 + 0.2 + 0.05) * 100 = 35
    expect(summary.generations.estCostCents).toBe(35);
  });
  it('computes Room Pass metrics', async () => {
    const mk = (id: string, data: object) => db.collection('leads').doc(id).set({
      id, ownerUid: 'a', leadToken: 't', status: 'generated', generatedImagePaths: [], costEstimateTotal: 0,
      timestamps: {}, createdAt: 0, updatedAt: 0, ...data,
    });
    await mk('pa', { pass: { restylesTotal: 5, restylesUsed: 1, expiresAt: 0 }, perk: { code: 'ROOM-ZZZ2', discountPct: 10, validUntil: 0, redeemedAt: 5 } });
    await mk('pb', { pass: { restylesTotal: 5, restylesUsed: 3, expiresAt: 0 }, perk: { code: 'ROOM-ZZZ3', discountPct: 10, validUntil: 0 } });
    await mk('pc', {}); // legacy, no pass
    const s = await computeAnalytics();
    expect(s.pass.paidPasses).toBe(2);
    expect(s.pass.avgRestylesUsed).toBe(2);
    expect(s.pass.perksRedeemed).toBe(1);
    expect(s.pass.perkRedemptionRate).toBe(0.5);
  });
});
