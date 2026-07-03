import { describe, it, expect } from 'vitest';
import { db } from './admin';
import { createLeadDoc } from './leads';

describe('createLeadDoc', () => {
  it('creates a captured lead owned by the uid', async () => {
    const { leadId, leadToken } = await createLeadDoc('uid_abc');
    const snap = await db.collection('leads').doc(leadId).get();
    const lead = snap.data()!;
    expect(lead.status).toBe('captured');
    expect(lead.ownerUid).toBe('uid_abc');
    expect(lead.leadToken).toBe(leadToken);
    expect(lead.generatedImagePaths).toEqual([]);
  });
});
