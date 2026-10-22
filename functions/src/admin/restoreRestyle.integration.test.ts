import { describe, it, expect } from 'vitest';
import { db } from '../admin';
import { createLeadDoc } from '../leads';
import { adminRestoreRestyleDoc } from './restoreRestyle';
import { IN_FLIGHT_STALE_MS } from '../../../src/domain/pass';

async function withPass(prefix: string, pass: Record<string, unknown>): Promise<string> {
  const { leadId } = await createLeadDoc(prefix);
  await db.collection('leads').doc(leadId).update({ pass });
  return leadId;
}

describe('adminRestoreRestyleDoc', () => {
  it('decrements restylesUsed', async () => {
    const leadId = await withPass('rr1', { restylesTotal: 5, restylesUsed: 3, expiresAt: Date.now() + 1000 });
    const res = await adminRestoreRestyleDoc(leadId);
    expect(res).toEqual({ restylesUsed: 2 });
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.pass.restylesUsed).toBe(2);
    expect(lead.pass.restylesTotal).toBe(5);
  });

  it('floors at 0', async () => {
    const leadId = await withPass('rr2', { restylesTotal: 5, restylesUsed: 0, expiresAt: Date.now() + 1000 });
    expect(await adminRestoreRestyleDoc(leadId)).toEqual({ restylesUsed: 0 });
    expect((await db.collection('leads').doc(leadId).get()).data()!.pass.restylesUsed).toBe(0);
  });

  it('clears a stale inFlight', async () => {
    const leadId = await withPass('rr3', { restylesTotal: 5, restylesUsed: 1, expiresAt: Date.now() + 1000, inFlight: Date.now() - IN_FLIGHT_STALE_MS - 1000 });
    await adminRestoreRestyleDoc(leadId);
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.pass.inFlight).toBeUndefined();
    expect(lead.pass.restylesUsed).toBe(0);
  });

  it('rejects while a restyle is live and leaves the lead unchanged', async () => {
    const inFlight = Date.now();
    const leadId = await withPass('rr3b', { restylesTotal: 5, restylesUsed: 2, expiresAt: Date.now() + 1000, inFlight });
    await expect(adminRestoreRestyleDoc(leadId)).rejects.toThrow(/generating right now/i);
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.pass.restylesUsed).toBe(2);
    expect(lead.pass.inFlight).toBe(inFlight);
  });

  it('rejects a lead without a Room Pass', async () => {
    const { leadId } = await createLeadDoc('rr4');
    await expect(adminRestoreRestyleDoc(leadId)).rejects.toThrow(/no Room Pass/i);
  });

  it('rejects an unknown lead', async () => {
    await expect(adminRestoreRestyleDoc('does-not-exist')).rejects.toThrow(/not found/i);
  });
});
