import { describe, it, expect } from 'vitest';
import { db, storage } from './admin';
import { createLeadDoc } from './leads';
import { submitFeedbackDoc, submitBookingDoc, regenerateDoc } from './leads';

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

  it('saves a valid interest', async () => {
    const leadId = await seedGeneratedLead('owner-int');
    await submitBookingDoc(leadId, 'owner-int', { name: 'Jane', interest: 'room_refresh' });
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.booking.interest).toBe('room_refresh');
  });

  it('rejects an unknown interest', async () => {
    const leadId = await seedGeneratedLead('owner-int2');
    await expect(submitBookingDoc(leadId, 'owner-int2', { name: 'Jane', interest: 'yacht' as never }))
      .rejects.toThrow(/interest/i);
  });
});

async function seedStyle() {
  await db.collection('styles').doc('scandi').set({
    slug: 'scandi', name: 'Scandinavian', description: 'Calm', galleryImages: [], sortOrder: 0, active: true,
    recipe: { description: 'd', materials: 'oak', palette: 'warm', furniture: 'low', avoid: 'clutter' },
  });
}

describe('regenerateDoc', () => {
  it('rejects a non-owner', async () => {
    const leadId = await seedGeneratedLead('owner5');
    await expect(regenerateDoc(leadId, 'intruder'))
      .rejects.toThrow(/permission/i);
  });

  it('rejects regeneration on a booked lead and leaves it booked', async () => {
    const leadId = await seedGeneratedLead('owner6');
    await submitBookingDoc(leadId, 'owner6', { name: 'Jane Doe' });
    await expect(regenerateDoc(leadId, 'owner6'))
      .rejects.toThrow(/restyle/i);
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.status).toBe('booked');
  });

  it('rejects an owner regenerate on a generated lead (restyles replace it)', async () => {
    const leadId = await seedGeneratedLead('owner7');
    await expect(regenerateDoc(leadId, 'owner7')).rejects.toThrow(/restyle/i);
  });

  it('allows an admin to re-run a failed lead even though they are not the owner', async () => {
    await seedStyle();
    const leadId = await seedGeneratedLead('owner8');
    const originalPhotoPath = `leads/${leadId}/original.jpg`;
    await db.collection('leads').doc(leadId).update({ originalPhotoPath, status: 'failed', 'timestamps.failed': Date.now() });
    await storage.bucket().file(originalPhotoPath).save(Buffer.from('fakejpeg'), { contentType: 'image/jpeg' });

    const before = (await db.collection('leads').doc(leadId).get()).data()!;
    await regenerateDoc(leadId, 'someAdminUid', { isAdmin: true });
    const after = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(after.generatedImagePaths.length).toBe(before.generatedImagePaths.length + 1);
    expect(after.status).toBe('generated');
  });

  it('rejects an admin re-run on a booked lead', async () => {
    const leadId = await seedGeneratedLead('owner9');
    await submitBookingDoc(leadId, 'owner9', { name: 'Jane Doe' });
    await expect(regenerateDoc(leadId, 'someAdminUid', { isAdmin: true }))
      .rejects.toThrow(/only available/i);
    const lead = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(lead.status).toBe('booked');
  });

  it('allows the OWNER to re-run their own failed lead (WaitScreen "Try again")', async () => {
    await seedStyle();
    const leadId = await seedGeneratedLead('owner10');
    const originalPhotoPath = `leads/${leadId}/original.jpg`;
    await db.collection('leads').doc(leadId).update({
      originalPhotoPath, status: 'failed', 'timestamps.failed': Date.now(),
    });
    await storage.bucket().file(originalPhotoPath).save(Buffer.from('fakejpeg'), { contentType: 'image/jpeg' });

    const before = (await db.collection('leads').doc(leadId).get()).data()!;
    await regenerateDoc(leadId, 'owner10'); // no admin opts — owner path
    const after = (await db.collection('leads').doc(leadId).get()).data()!;
    expect(after.generatedImagePaths.length).toBe(before.generatedImagePaths.length + 1);
    expect(after.status).toBe('generated');
  });
});
