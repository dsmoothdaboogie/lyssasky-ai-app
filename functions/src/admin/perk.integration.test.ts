import { describe, it, expect } from 'vitest';
import { db } from '../admin';
import { createLeadDoc } from '../leads';
import { adminMarkPerkRedeemedDoc } from './perk';

describe('adminMarkPerkRedeemedDoc', () => {
  it('stamps redeemedAt', async () => {
    const { leadId } = await createLeadDoc('perk1');
    await db.collection('leads').doc(leadId).update({ perk: { code: 'ROOM-RDMP', discountPct: 10, validUntil: Date.now() + 1000 } });
    await adminMarkPerkRedeemedDoc(leadId);
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.perk.redeemedAt).toBeGreaterThan(0);
    expect(lead.perk.code).toBe('ROOM-RDMP');
  });

  it('rejects a lead without a perk', async () => {
    const { leadId } = await createLeadDoc('perk2');
    await expect(adminMarkPerkRedeemedDoc(leadId)).rejects.toThrow(/no perk/i);
  });

  it('is idempotent — keeps the first redeemedAt', async () => {
    const { leadId } = await createLeadDoc('perk3');
    await db.collection('leads').doc(leadId).update({ perk: { code: 'ROOM-TWCE', discountPct: 10, validUntil: 1, redeemedAt: 42 } });
    await adminMarkPerkRedeemedDoc(leadId);
    expect((await db.collection('leads').doc(leadId).get()).data()!.perk.redeemedAt).toBe(42);
  });
});
