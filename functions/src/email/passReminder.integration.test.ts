import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../admin';
import { createLeadDoc } from '../leads';
import { sendPassReminders } from './passReminder';
import { DAY_MS } from '../../../src/domain/pass';
import type { Lead } from '../../../src/domain/types';

const NOW = Date.UTC(2030, 0, 1); // far future so no other test's leads match

async function seed(owner: string, o: Partial<Lead>) {
  const { leadId } = await createLeadDoc(owner);
  await db.collection('leads').doc(leadId).update({
    status: 'generated', email: `${owner}@example.com`,
    looks: [{ imagePath: 'a.png', styleSlug: 'scandi', colorMood: 'warm_cozy', createdAt: 1 }],
    timestamps: { paid: NOW - 2 * DAY_MS },
    pass: { restylesTotal: 5, restylesUsed: 0, expiresAt: NOW + 12 * 60 * 60 * 1000 },
    perk: { code: 'ROOM-REMD', discountPct: 10, validUntil: NOW + 30 * DAY_MS },
    ...o,
  });
  return leadId;
}
const mailFor = async (id: string) => (await db.collection('mail').where('leadId', '==', id).where('kind', '==', 'pass_expiring').get()).size;

describe('sendPassReminders', () => {
  beforeEach(async () => {
    const old = await db.collection('mail').where('kind', '==', 'pass_expiring').get();
    await Promise.all(old.docs.map((d) => d.ref.delete()));
  });

  it('emails a pass ending within 24h, once', async () => {
    const id = await seed('rem1', {});
    await sendPassReminders(NOW);
    await sendPassReminders(NOW + 60_000);
    expect(await mailFor(id)).toBe(1);
    expect((await db.collection('leads').doc(id).get()).data()!.remindedAt).toBeGreaterThan(0);
  });

  it('skips booked, emailless, already-expired and far-off passes', async () => {
    const booked = await seed('rem2', { status: 'booked', booking: { name: 'x' } });
    const noEmail = await seed('rem3', { email: undefined });
    await db.collection('leads').doc(noEmail).update({ email: null });
    const expired = await seed('rem4', { pass: { restylesTotal: 5, restylesUsed: 0, expiresAt: NOW - 1 } });
    const later = await seed('rem5', { pass: { restylesTotal: 5, restylesUsed: 0, expiresAt: NOW + 3 * DAY_MS } });
    await sendPassReminders(NOW);
    for (const id of [booked, noEmail, expired, later]) expect(await mailFor(id)).toBe(0);
  });

  it('skips leads with no looks and leads that paid less than 24h ago', async () => {
    const noLooks = await seed('rem6', { looks: [] });
    const justPaid = await seed('rem7', { timestamps: { paid: NOW - 60 * 60 * 1000 } });
    await sendPassReminders(NOW);
    for (const id of [noLooks, justPaid]) {
      expect(await mailFor(id)).toBe(0);
      expect((await db.collection('leads').doc(id).get()).data()!.remindedAt).toBeUndefined();
    }
  });
});
