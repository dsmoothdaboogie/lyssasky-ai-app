import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../admin';
import { assertTransition } from '../../../src/domain/leadStatus';
import { logEventDoc } from '../events';
import type { Lead } from '../../../src/domain/types';

export async function handlePaymentConfirmed(leadId: string, paymentId: string) {
  const ref = db.collection('leads').doc(leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');
  assertTransition(lead.status, 'paid');
  const now = Date.now();
  await ref.update({
    status: 'paid', paymentId,
    'timestamps.paid': now, updatedAt: now,
  });
  await logEventDoc({ type: 'payment_completed', leadId });
}
