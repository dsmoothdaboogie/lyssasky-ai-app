import { randomUUID } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, storage } from './admin';
import type { Lead, LeadStatus } from '../../src/domain/types';

/**
 * Resolves a Storage path to a public "download token" URL — the same
 * `?alt=media&token=...` URL shape `getDownloadURL` (client SDK) and the
 * Firebase Console produce. A valid token is its own credential: the Storage
 * backend serves an `alt=media` request with a matching token regardless of
 * security rules (this is what makes "copy download URL" links work for
 * anonymous visitors in production), so this is safe to hand back to a
 * caller who hasn't proven Storage-rule ownership.
 *
 * `firebase-admin/storage`'s own `getDownloadURL` helper looks like the
 * obvious fit here, but it fetches the object's metadata via the
 * Firebase-proprietary `/v0/b/.../o/...` endpoint — and unlike the plain GCS
 * JSON API (what `file.getMetadata()` / `file.save()` use, and what the
 * Admin SDK genuinely bypasses rules for), the Storage *emulator* enforces
 * security rules on that endpoint even for admin callers, so it fails there
 * with `storage/unauthorized` even though it would succeed in production.
 * `getSignedUrl` doesn't work either: it requires real signing credentials
 * that the emulator doesn't have. Reading/writing the download token
 * ourselves via `getMetadata`/`setMetadata` (verified to bypass rules in
 * both the emulator and production) and building the URL by hand avoids
 * both problems — this is the same mechanism, just without the
 * emulator-hostile hop.
 */
async function resolveDownloadUrl(path: string): Promise<string> {
  const file = storage.bucket().file(path);
  const [metadata] = await file.getMetadata();
  const existing = metadata.metadata?.firebaseStorageDownloadTokens;
  let token = typeof existing === 'string' ? existing.split(',')[0] : undefined;
  if (!token) {
    token = randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  }
  const host = process.env.STORAGE_EMULATOR_HOST || 'https://firebasestorage.googleapis.com';
  return `${host}/v0/b/${file.bucket.name}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;
}

/**
 * The cross-device "emailed link" read path (Phase 2): a customer who opens
 * their result link on a different device gets a fresh anonymous auth uid
 * that doesn't satisfy the lead's `ownerUid` — so this reads by the opaque
 * `leadToken` instead of relying on Firestore auth rules. The token IS the
 * credential here, so a mismatch (or a lead that doesn't exist) is
 * indistinguishable to the caller: both come back as `permission-denied`
 * rather than leaking whether a given leadId exists.
 *
 * Resolves each Storage path to a download URL *here*, server-side (see
 * `resolveDownloadUrl` above), rather than returning raw paths for the
 * client to resolve with the client Storage SDK. The client-side path
 * (`getImageUrl` / `getDownloadURL` from `firebase/storage`) is what
 * actually broke this feature: generated images live at
 * `leads/{ownerUid}/generated/*`, and storage.rules only allows read there
 * for the owning uid or an admin — but the whole point of this callable is
 * to serve a device whose fresh anonymous uid is neither.
 */
export async function getResultByTokenDoc(
  leadId: string,
  leadToken: string
): Promise<{ status: LeadStatus; imageUrls: string[] }> {
  const lead = (await db.collection('leads').doc(leadId).get()).data() as Lead | undefined;
  if (!lead || lead.leadToken !== leadToken) {
    throw new HttpsError('permission-denied', 'Invalid link');
  }
  const imageUrls = await Promise.all(lead.generatedImagePaths.map(resolveDownloadUrl));
  return { status: lead.status, imageUrls };
}

export const getResultByToken = onCall(async (req) => {
  const { leadId, leadToken } = (req.data ?? {}) as { leadId?: unknown; leadToken?: unknown };
  if (typeof leadId !== 'string' || !leadId || typeof leadToken !== 'string' || !leadToken) {
    throw new HttpsError('invalid-argument', 'leadId and leadToken are required');
  }
  return getResultByTokenDoc(leadId, leadToken);
});
