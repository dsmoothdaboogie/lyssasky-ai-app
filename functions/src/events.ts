import { onCall } from 'firebase-functions/v2/https';
import { db } from './admin';
import type { AnalyticsEvent } from '../../src/domain/types';

export async function logEventDoc(e: Omit<AnalyticsEvent, 'createdAt'>) {
  await db.collection('events').add({ ...e, createdAt: Date.now() });
}

export const logEvent = onCall(async (req) => {
  await logEventDoc({ type: req.data.type, leadId: req.data.leadId, meta: req.data.meta });
  return { ok: true };
});
