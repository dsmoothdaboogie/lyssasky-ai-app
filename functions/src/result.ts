import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin';
import type { Lead, LeadStatus } from '../../src/domain/types';

/**
 * The cross-device "emailed link" read path (Phase 2): a customer who opens
 * their result link on a different device gets a fresh anonymous auth uid
 * that doesn't satisfy the lead's `ownerUid` — so this reads by the opaque
 * `leadToken` instead of relying on Firestore auth rules. The token IS the
 * credential here, so a mismatch (or a lead that doesn't exist) is
 * indistinguishable to the caller: both come back as `permission-denied`
 * rather than leaking whether a given leadId exists.
 *
 * Returns Storage *paths* rather than resolved download URLs: the client
 * already has `getImageUrl` (Storage SDK `getDownloadURL`) for turning a
 * path into a viewable URL, which is proven to work against both the
 * emulator and production. Doing the same resolution here with the Admin
 * SDK would mean signed URLs, which behave differently in the emulator, so
 * returning paths keeps this one code path for image resolution everywhere
 * in the app.
 */
export async function getResultByTokenDoc(
  leadId: string,
  leadToken: string
): Promise<{ status: LeadStatus; imagePaths: string[] }> {
  const lead = (await db.collection('leads').doc(leadId).get()).data() as Lead | undefined;
  if (!lead || lead.leadToken !== leadToken) {
    throw new HttpsError('permission-denied', 'Invalid link');
  }
  return { status: lead.status, imagePaths: lead.generatedImagePaths };
}

export const getResultByToken = onCall(async (req) => {
  const { leadId, leadToken } = (req.data ?? {}) as { leadId?: unknown; leadToken?: unknown };
  if (typeof leadId !== 'string' || !leadId || typeof leadToken !== 'string' || !leadToken) {
    throw new HttpsError('invalid-argument', 'leadId and leadToken are required');
  }
  return getResultByTokenDoc(leadId, leadToken);
});
