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
