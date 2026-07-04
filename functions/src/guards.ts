import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import type { Lead } from '../../src/domain/types';

export function assertOwner(uid: string | undefined, lead: Lead) {
  if (!uid || uid !== lead.ownerUid) {
    throw new HttpsError('permission-denied', 'Permission denied: not your lead');
  }
}

export function assertAdmin(auth: CallableRequest['auth']): void {
  if (!auth || auth.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
}
