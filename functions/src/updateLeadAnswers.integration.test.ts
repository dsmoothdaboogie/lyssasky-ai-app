import { describe, it, expect } from 'vitest';
import { db } from './admin';
import { createLeadDoc } from './leads';
import { updateLeadAnswersDoc } from './leads';

const answers = { roomType: 'living_room', styleSlug: 'scandi', colorMood: 'warm_cozy', budget: '1k_5k', timeline: 'asap' };

describe('updateLeadAnswersDoc', () => {
  it('saves answers + email for the owner', async () => {
    const { leadId } = await createLeadDoc('owner1');
    await updateLeadAnswersDoc(leadId, 'owner1', answers, 'a@b.com');
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.email).toBe('a@b.com');
    expect(lead.answers.styleSlug).toBe('scandi');
  });
  it('rejects a non-owner', async () => {
    const { leadId } = await createLeadDoc('owner1');
    await expect(updateLeadAnswersDoc(leadId, 'intruder', answers, 'x@y.com'))
      .rejects.toThrow(/permission/i);
  });
});
