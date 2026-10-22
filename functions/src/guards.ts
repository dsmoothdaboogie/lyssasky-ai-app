import { timingSafeEqual } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Lead } from '../../src/domain/types';

export function assertOwner(uid: string | undefined, lead: Lead) {
  if (!uid || uid !== lead.ownerUid) {
    throw new HttpsError('permission-denied', 'Permission denied: not your lead');
  }
}

/** Constant-time check that `leadToken` is the lead's secret token. False for a missing lead. */
export function tokenMatches(lead: Pick<Lead, 'leadToken'> | undefined, leadToken?: unknown): boolean {
  if (!lead || typeof leadToken !== 'string' || leadToken.length === 0 || typeof lead.leadToken !== 'string') return false;
  const given = Buffer.from(leadToken);
  const actual = Buffer.from(lead.leadToken);
  return given.length === actual.length && timingSafeEqual(given, actual);
}

/**
 * Passes for the lead's owner, or for any caller presenting the lead's secret
 * token (the emailed link, opened on another device). Token compare is constant-time.
 */
export function assertOwnerOrToken(uid: string | undefined, lead: Lead, leadToken?: unknown) {
  if (uid && uid === lead.ownerUid) return;
  if (tokenMatches(lead, leadToken)) return;
  throw new HttpsError('permission-denied', 'Permission denied: not your lead');
}

export function assertAdmin(auth: CallableRequest['auth']): void {
  if (!auth || auth.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
}
