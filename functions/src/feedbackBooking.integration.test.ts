import { describe, it, expect } from 'vitest';
import { db } from './admin';
import { createLeadDoc } from './leads';
import { submitFeedbackDoc, submitBookingDoc } from './leads';

const answers = { roomType: 'living_room', styleSlug: 'scandi', colorMood: 'warm_cozy', budget: '1k_5k', timeline: 'asap' };

async function seedGeneratedLead(ownerUid: string) {
  const { leadId } = await createLeadDoc(ownerUid);
  const ref = db.collection('leads').doc(leadId);
  await ref.update({
    status: 'generated',
    answers,
    generatedImagePaths: ['leads/x/generated/1.png'],
    'timestamps.generated': Date.now(),
    updatedAt: Date.now(),
  });
  return leadId;
}

describe('submitFeedbackDoc', () => {
  it('saves rating + feedback and advances status to rated', async () => {
    const leadId = await seedGeneratedLead('owner1');
    await submitFeedbackDoc(leadId, 'owner1', 4, 'Loved the sofa placement');
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.status).toBe('rated');
    expect(lead.rating).toBe(4);
    expect(lead.feedback).toBe('Loved the sofa placement');
    expect(lead.timestamps.rated).toBeGreaterThan(0);

    const events = await db.collection('events').where('leadId', '==', leadId).get();
    const resultRated = events.docs.find(d => d.data().type === 'result_rated');
    expect(resultRated).toBeTruthy();
    expect(resultRated!.data().meta.rating).toBe(4);
  });

  it('rejects a non-owner', async () => {
    const leadId = await seedGeneratedLead('owner2');
    await expect(submitFeedbackDoc(leadId, 'intruder', 5, 'nope'))
      .rejects.toThrow(/permission/i);
  });

  it('rejects a non-existent lead', async () => {
    await expect(submitFeedbackDoc('does-not-exist', 'u', 5, 'x'))
      .rejects.toThrow(/not.?found/i);
  });
});

describe('submitBookingDoc', () => {
  it('saves booking and advances status to booked (skipping rating)', async () => {
    const leadId = await seedGeneratedLead('owner3');
    await submitBookingDoc(leadId, 'owner3', { name: 'Jane Doe', phone: '555-1234', note: 'Prefer weekends' });
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.status).toBe('booked');
    expect(lead.booking).toEqual({ name: 'Jane Doe', phone: '555-1234', note: 'Prefer weekends' });
    expect(lead.timestamps.booked).toBeGreaterThan(0);

    const events = await db.collection('events').where('leadId', '==', leadId).get();
    const bookingSubmitted = events.docs.find(d => d.data().type === 'booking_submitted');
    expect(bookingSubmitted).toBeTruthy();
  });

  it('rejects a non-owner', async () => {
    const leadId = await seedGeneratedLead('owner4');
    await expect(submitBookingDoc(leadId, 'intruder', { name: 'X' }))
      .rejects.toThrow(/permission/i);
  });

  it('rejects a non-existent lead', async () => {
    await expect(submitBookingDoc('does-not-exist', 'u', { name: 'X' }))
      .rejects.toThrow(/not.?found/i);
  });
});
