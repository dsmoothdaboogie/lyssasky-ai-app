import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../admin';
import { assertAdmin } from '../guards';
import { isRestyleInFlight } from '../../../src/domain/pass';
import type { Lead } from '../../../src/domain/types';

export async function adminRestoreRestyleDoc(leadId: string): Promise<{ restylesUsed: number }> {
  const ref = db.collection('leads').doc(leadId);
  return db.runTransaction(async (tx) => {
    const lead = (await tx.get(ref)).data() as Lead | undefined;
    if (!lead) throw new HttpsError('not-found', 'Lead not found');
    if (!lead.pass) throw new HttpsError('failed-precondition', 'This lead has no Room Pass');
    if (isRestyleInFlight(lead, Date.now())) {
      throw new HttpsError('failed-precondition', 'A restyle is generating right now — try again in a minute.');
    }
    const restylesUsed = Math.max(0, lead.pass.restylesUsed - 1);
    tx.update(ref, {
      'pass.restylesUsed': restylesUsed,
      'pass.inFlight': FieldValue.delete(),
      updatedAt: Date.now(),
    });
    return { restylesUsed };
  });
}

export const adminRestoreRestyle = onCall(async (req) => {
  assertAdmin(req.auth);
  const leadId = req.data?.leadId;
  if (typeof leadId !== 'string' || !leadId) throw new HttpsError('invalid-argument', 'leadId is required');
  const { restylesUsed } = await adminRestoreRestyleDoc(leadId);
  return { ok: true, restylesUsed };
});
