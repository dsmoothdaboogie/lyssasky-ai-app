import { onCall } from 'firebase-functions/v2/https';
import { db } from './admin';
import type { AnalyticsEvent } from '../../src/domain/types';

export async function logEventDoc(e: Omit<AnalyticsEvent, 'createdAt'>) {
  await db.collection('events').add({ ...e, createdAt: Date.now() });
}

// Intentionally NOT auth-guarded: the very first funnel event, `page_view`,
// fires on the landing page before the customer is ever signed in (anonymous
// auth doesn't happen until the upload step). Events are admin-read-only, so
// unauthenticated appends are low-risk; App Check is the right defense later.
export const logEvent = onCall(async (req) => {
  await logEventDoc({ type: req.data.type, leadId: req.data.leadId, meta: req.data.meta });
  return { ok: true };
});
