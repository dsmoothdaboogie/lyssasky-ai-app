import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../admin';
import { assertAdmin } from '../guards';
import type { Lead } from '../../../src/domain/types';

export async function adminMarkPerkRedeemedDoc(leadId: string): Promise<void> {
  const ref = db.collection('leads').doc(leadId);
  await db.runTransaction(async (tx) => {
    const lead = (await tx.get(ref)).data() as Lead | undefined;
    if (!lead) throw new HttpsError('not-found', 'Lead not found');
    if (!lead.perk) throw new HttpsError('failed-precondition', 'This lead has no perk');
    if (lead.perk.redeemedAt !== undefined) return;
    tx.update(ref, { 'perk.redeemedAt': Date.now(), updatedAt: Date.now() });
  });
}

export const adminMarkPerkRedeemed = onCall(async (req) => {
  assertAdmin(req.auth);
  const leadId = req.data?.leadId;
  if (typeof leadId !== 'string' || !leadId) throw new HttpsError('invalid-argument', 'leadId is required');
  await adminMarkPerkRedeemedDoc(leadId);
  return { ok: true };
});
