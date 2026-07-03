import { describe, it, expect } from 'vitest';
import { db } from './admin';
import { logEventDoc } from './events';

describe('logEventDoc', () => {
  // Regression: a bare page_view carries no leadId/meta. Firestore rejects an
  // explicit `undefined` field value unless ignoreUndefinedProperties is set
  // (configured in admin.ts). Before that, page_view logging threw INTERNAL
  // and the landing page produced an unhandled rejection on load.
  it('persists an event that omits leadId and meta (e.g. page_view)', async () => {
    await expect(
      logEventDoc({ type: 'page_view', leadId: undefined, meta: undefined })
    ).resolves.toBeUndefined();

    const snap = await db.collection('events').where('type', '==', 'page_view').get();
    expect(snap.size).toBeGreaterThanOrEqual(1);
    const data = snap.docs[0].data();
    expect(data.type).toBe('page_view');
    expect(typeof data.createdAt).toBe('number');
    // the undefined fields must have been dropped, not stored as null/undefined
    expect('leadId' in data).toBe(false);
  });
});
