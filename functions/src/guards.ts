import { HttpsError } from 'firebase-functions/v2/https';
import type { Lead } from '../../src/domain/types';

export function assertOwner(uid: string | undefined, lead: Lead) {
  if (!uid || uid !== lead.ownerUid) {
    throw new HttpsError('permission-denied', 'Permission denied: not your lead');
  }
}
