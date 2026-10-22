import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../admin';
import { assertTransition } from '../../../src/domain/leadStatus';
import { buildPassFields } from '../../../src/domain/pass';
import { logEventDoc } from '../events';
import { loadConfig } from '../config';
import { allocatePerkCode } from '../pass/perkCode';
import type { Lead } from '../../../src/domain/types';

export async function handlePaymentConfirmed(leadId: string, paymentId: string) {
  const ref = db.collection('leads').doc(leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');
  assertTransition(lead.status, 'paid');
  const [config, code] = await Promise.all([loadConfig(), allocatePerkCode()]);
  const now = Date.now();
  // Pass + perk are written in the SAME update as status:'paid' so the
  // onLeadPaid trigger (and the customer) never see a paid lead without them.
  await ref.update({
    status: 'paid', paymentId,
    ...buildPassFields(now, config, code),
    'timestamps.paid': now, updatedAt: now,
  });
  await logEventDoc({ type: 'payment_completed', leadId });
}
