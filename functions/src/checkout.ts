import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin';
import { loadConfig } from './config';
import { assertOwner } from './guards';
import { createMockPaymentProvider } from './payment/mockProvider';
import { handlePaymentConfirmed } from './payment/handlePaymentConfirmed';
import { logEventDoc } from './events';
import type { Lead } from '../../src/domain/types';

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:5173';

export const startCheckout = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  const cfg = await loadConfig();
  const ref = db.collection('leads').doc(req.data.leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');
  assertOwner(req.auth.uid, lead);
  const provider = createMockPaymentProvider(APP_BASE_URL); // Phase 3: switch on cfg.paymentMode
  const session = await provider.createCheckoutSession({
    leadId: lead.id, amountCents: cfg.priceCents, currency: cfg.currency,
  });
  await logEventDoc({ type: 'checkout_started', leadId: lead.id });
  return { checkoutUrl: session.checkoutUrl };
});

export const confirmPaymentMock = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  const cfg = await loadConfig();
  if (cfg.paymentMode !== 'mock') throw new HttpsError('failed-precondition', 'Not in mock mode');
  const ref = db.collection('leads').doc(req.data.leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');
  assertOwner(req.auth.uid, lead);
  await handlePaymentConfirmed(lead.id, req.data.sessionId ?? `mock_${lead.id}`);
  return { ok: true };
});
