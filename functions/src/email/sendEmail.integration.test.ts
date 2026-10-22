import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../admin';
import { createLeadDoc } from '../leads';
import { sendEmailDoc, handleLeadBooked } from './sendEmail';

const answers = { roomType: 'living_room', styleSlug: 'scandi', colorMood: 'warm_cozy', budget: '1k_5k', timeline: 'asap' };

beforeAll(async () => {
  // Functions tests share the emulator (fileParallelism:false), so start
  // from a clean `mail` collection for deterministic assertions below.
  const existing = await db.collection('mail').get();
  await Promise.all(existing.docs.map((d) => d.ref.delete()));
});

describe('sendEmailDoc', () => {
  it('writes a mail doc in the Trigger Email extension shape', async () => {
    await sendEmailDoc({ to: 'm@x.com', subject: 's', html: '<p>h</p>', kind: 'booking_notification', leadId: 'l1' });
    const snap = await db.collection('mail').where('leadId', '==', 'l1').get();
    expect(snap.size).toBe(1);
    const doc = snap.docs[0].data();
    expect(doc.to).toBe('m@x.com');
    expect(doc.message.subject).toBe('s');
    expect(doc.message.html).toBe('<p>h</p>');
    expect(doc.kind).toBe('booking_notification');
    expect(doc.createdAt).toBeGreaterThan(0);
  });
});

async function seedBookedLead(ownerUid: string) {
  const { leadId } = await createLeadDoc(ownerUid);
  const ref = db.collection('leads').doc(leadId);
  await ref.update({
    status: 'booked',
    email: 'customer@example.com',
    answers,
    generatedImagePaths: ['leads/x/generated/1.png'],
    rating: 4,
    feedback: 'Loved the sofa placement',
    booking: { name: 'Jane Doe', phone: '555-1234', note: 'Prefer weekends' },
    'timestamps.booked': Date.now(),
    updatedAt: Date.now(),
  });
  return leadId;
}

describe('handleLeadBooked', () => {
  it('sends a booking_notification email to config.notifyEmail', async () => {
    const leadId = await seedBookedLead('owner-booked-1');
    await handleLeadBooked(leadId);

    const snap = await db.collection('mail').where('leadId', '==', leadId).get();
    expect(snap.size).toBe(1);
    const doc = snap.docs[0].data();
    expect(doc.to).toBe('marjorie@lyssasky.com');
    expect(doc.kind).toBe('booking_notification');
    expect(doc.message.subject).toMatch(/customer@example\.com/);
    expect(doc.message.html).toMatch(/customer@example\.com/);
    expect(doc.message.html).toMatch(/Jane Doe/);
    expect(doc.message.html).toMatch(leadId);
  });

  it('does nothing when the lead does not exist', async () => {
    await expect(handleLeadBooked('does-not-exist')).resolves.toBeUndefined();
  });

  it('is idempotent — a redelivered booked trigger does not queue a second email', async () => {
    const leadId = await seedBookedLead('owner-booked-dup');

    // At-least-once trigger delivery: handleLeadBooked can run twice for the
    // same booked transition. The second run must not add another mail doc.
    await handleLeadBooked(leadId);
    await handleLeadBooked(leadId);

    const snap = await db.collection('mail').where('leadId', '==', leadId).get();
    expect(snap.size).toBe(1);
  });

  it('escapes HTML injected via customer-controlled fields', async () => {
    const { leadId } = await createLeadDoc('owner-booked-injection');
    const ref = db.collection('leads').doc(leadId);
    await ref.update({
      status: 'booked',
      email: 'customer@example.com',
      answers,
      generatedImagePaths: ['leads/x/generated/1.png'],
      rating: 4,
      feedback: '<script>alert(1)</script>',
      booking: { name: '<a href="http://evil">x</a>', phone: '555-1234', note: 'Prefer weekends' },
      'timestamps.booked': Date.now(),
      updatedAt: Date.now(),
    });

    await handleLeadBooked(leadId);

    const snap = await db.collection('mail').where('leadId', '==', leadId).get();
    expect(snap.size).toBe(1);
    const doc = snap.docs[0].data();
    expect(doc.message.html).not.toContain('<script>alert(1)</script>');
    expect(doc.message.html).not.toContain('<a href="http://evil">');
    expect(doc.message.html).toContain('&lt;script&gt;');
    expect(doc.message.html).toContain('&lt;a ');
  });
});

it('booking notification carries the perk code and interest', async () => {
  const { leadId } = await createLeadDoc('mail-perk');
  await db.collection('leads').doc(leadId).update({
    status: 'booked', email: 'c@example.com',
    booking: { name: 'Jane', interest: 'virtual_styling' },
    perk: { code: 'ROOM-MAIL', discountPct: 10, validUntil: Date.now() + 1000 },
    looks: [],
  });
  await handleLeadBooked(leadId);
  const snap = await db.collection('mail').where('leadId', '==', leadId).get();
  const html = snap.docs[0].data().message.html as string;
  expect(html).toContain('ROOM-MAIL');
  expect(html).toContain('Virtual Styling');
});
