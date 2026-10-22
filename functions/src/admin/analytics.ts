import { onCall } from 'firebase-functions/v2/https';
import { db } from '../admin';
import { assertAdmin } from '../guards';
import { loadConfig } from '../config';
import type { AnalyticsSummary, Lead, GenerationRecord, LeadStatus } from '../../../src/domain/types';

const FUNNEL_STATUSES: LeadStatus[] = ['captured', 'paid', 'generated', 'rated', 'booked', 'failed'];
// Every lead that reached payment counts toward revenue — including a lead
// whose generation later failed, since the customer still paid. 'failed' is
// only ever reachable after 'paid' (see LEAD_TRANSITIONS), so counting it here
// never over-reports.
const REVENUE_STATUSES: ReadonlySet<LeadStatus> = new Set(['paid', 'generated', 'rated', 'booked', 'failed']);

export async function computeAnalytics(): Promise<AnalyticsSummary> {
  const config = await loadConfig();
  const [leadsSnap, genSnap] = await Promise.all([
    db.collection('leads').get(),
    db.collection('generations').get(),
  ]);
  const leads = leadsSnap.docs.map((d) => d.data() as Lead);
  const generations = genSnap.docs.map((d) => d.data() as GenerationRecord);

  const funnel = FUNNEL_STATUSES.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as AnalyticsSummary['funnel']);
  for (const lead of leads) {
    if (lead.status in funnel) {
      funnel[lead.status] += 1;
    }
  }

  const styleCounts = new Map<string, number>();
  const ratingsByStyle = new Map<string, number[]>();
  const budgetDistribution: Record<string, number> = {};
  const timelineDistribution: Record<string, number> = {};

  for (const lead of leads) {
    const slug = lead.answers?.styleSlug;
    if (slug) {
      styleCounts.set(slug, (styleCounts.get(slug) ?? 0) + 1);
      if (typeof lead.rating === 'number') {
        const arr = ratingsByStyle.get(slug) ?? [];
        arr.push(lead.rating);
        ratingsByStyle.set(slug, arr);
      }
    }
    const budget = lead.answers?.budget;
    if (budget) {
      budgetDistribution[budget] = (budgetDistribution[budget] ?? 0) + 1;
    }
    const timeline = lead.answers?.timeline;
    if (timeline) {
      timelineDistribution[timeline] = (timelineDistribution[timeline] ?? 0) + 1;
    }
  }

  const stylePopularity = [...styleCounts.entries()]
    .map(([slug, count]) => ({ slug, count }))
    .sort((a, b) => b.count - a.count);

  const avgRatingByStyle = [...ratingsByStyle.entries()].map(([slug, ratings]) => {
    const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    return { slug, avg: Math.round(avg * 100) / 100, count: ratings.length };
  });

  const revenueCents = leads.filter((l) => REVENUE_STATUSES.has(l.status)).length * config.priceCents;

  const failedGenerations = generations.filter((g) => g.status === 'failed').length;
  const totalDurationMs = generations.reduce((sum, g) => sum + (g.durationMs ?? 0), 0);
  const avgDurationMs = generations.length > 0 ? totalDurationMs / generations.length : 0;
  const totalCostEstimate = generations.reduce((sum, g) => sum + (g.costEstimate ?? 0), 0);

  const passLeads = leads.filter((l) => l.pass);
  const perksRedeemed = leads.filter((l) => l.perk?.redeemedAt !== undefined).length;
  const pass = {
    paidPasses: passLeads.length,
    avgRestylesUsed: passLeads.length
      ? Math.round((passLeads.reduce((s, l) => s + l.pass!.restylesUsed, 0) / passLeads.length) * 100) / 100
      : 0,
    perksRedeemed,
    perkRedemptionRate: passLeads.length ? perksRedeemed / passLeads.length : 0,
  };

  return {
    funnel,
    totalLeads: leads.length,
    stylePopularity,
    avgRatingByStyle,
    budgetDistribution,
    timelineDistribution,
    revenueCents,
    generations: {
      total: generations.length,
      failed: failedGenerations,
      avgDurationMs,
      estCostCents: Math.round(totalCostEstimate * 100),
    },
    pass,
  };
}

export const adminGetAnalytics = onCall(async (req) => {
  assertAdmin(req.auth);
  return computeAnalytics();
});
