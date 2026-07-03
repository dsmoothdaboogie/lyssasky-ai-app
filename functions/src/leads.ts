import { randomUUID } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin';
import type { Lead } from '../../src/domain/types';

export async function createLeadDoc(ownerUid: string) {
  const ref = db.collection('leads').doc();
  const now = Date.now();
  const leadToken = randomUUID();
  const lead: Lead = {
    id: ref.id, ownerUid, leadToken, status: 'captured',
    generatedImagePaths: [], costEstimateTotal: 0,
    timestamps: { captured: now }, createdAt: now, updatedAt: now,
  };
  await ref.set(lead);
  return { leadId: ref.id, leadToken };
}

export const createLead = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  return createLeadDoc(req.auth.uid);
});
