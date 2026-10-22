import { describe, it, expect } from 'vitest';
import { db } from '../admin';
import { createLeadDoc } from '../leads';
import { handlePaymentConfirmed } from './handlePaymentConfirmed';

describe('handlePaymentConfirmed', () => {
  it('advances a captured lead to paid', async () => {
    const { leadId } = await createLeadDoc('owner1');
    await handlePaymentConfirmed(leadId, 'pay_1');
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.status).toBe('paid');
    expect(lead.paymentId).toBe('pay_1');
    expect(lead.timestamps.paid).toBeGreaterThan(0);
  });
});

import { DAY_MS } from '../../../src/domain/pass';

describe('handlePaymentConfirmed — Room Pass', () => {
  it('issues a pass and perk snapshotted from config', async () => {
    await db.collection('config').doc('app').set({ passRestyles: 4, passDays: 3, perkDiscountPct: 15, perkDays: 10 }, { merge: true });
    const { leadId } = await createLeadDoc('owner-pass');
    await handlePaymentConfirmed(leadId, 'pay_pass');
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    const paidAt = lead.timestamps.paid;
    expect(lead.pass).toEqual({ restylesTotal: 4, restylesUsed: 0, expiresAt: paidAt + 3 * DAY_MS });
    expect(lead.perk.code).toMatch(/^ROOM-[A-Z2-9]{4}$/);
    expect(lead.perk.discountPct).toBe(15);
    expect(lead.perk.validUntil).toBe(paidAt + 10 * DAY_MS);
    expect(lead.looks).toEqual([]);
    // restore defaults for other test files
    await db.collection('config').doc('app').set({ passRestyles: 5, passDays: 7, perkDiscountPct: 10, perkDays: 30 }, { merge: true });
  });
});
