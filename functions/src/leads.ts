import { randomUUID } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from './admin';
import { assertOwner } from './guards';
import { assertTransition } from '../../src/domain/leadStatus';
import { logEventDoc } from './events';
import { runGeneration } from './generation/runGeneration';
import { BOOKING_INTERESTS } from '../../src/domain/pass';
import type { Lead, QuestionnaireAnswers } from '../../src/domain/types';

export async function createLeadDoc(ownerUid: string) {
  const ref = db.collection('leads').doc();
  const now = Date.now();
  const leadToken = randomUUID();
  const lead: Lead = {
    id: ref.id, ownerUid, leadToken, status: 'captured',
    generatedImagePaths: [], costEstimateTotal: 0,
    timestamps: { captured: now }, createdAt: now, updatedAt: now,
  };
  await ref.set(lead);
  return { leadId: ref.id, leadToken };
}

export const createLead = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  return createLeadDoc(req.auth.uid);
});

export async function updateLeadAnswersDoc(
  leadId: string,
  uid: string,
  answers: QuestionnaireAnswers,
  email: string
) {
  const ref = db.collection('leads').doc(leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');
  assertOwner(uid, lead);
  await ref.update({ answers, email, updatedAt: Date.now() });
  await logEventDoc({ type: 'email_captured', leadId });
  await logEventDoc({ type: 'questionnaire_completed', leadId, meta: { style: answers.styleSlug } });
}

export const updateLeadAnswers = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  await updateLeadAnswersDoc(req.data.leadId, req.auth.uid, req.data.answers, req.data.email);
  return { ok: true };
});

export async function attachPhotoDoc(leadId: string, uid: string, path: string): Promise<void> {
  const ref = db.collection('leads').doc(leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');
  assertOwner(uid, lead);
  await ref.update({ originalPhotoPath: path, updatedAt: Date.now() });
  await logEventDoc({ type: 'photo_uploaded', leadId });
}

export const attachPhoto = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  await attachPhotoDoc(req.data.leadId, req.auth.uid, req.data.path);
  return { ok: true };
});

export async function submitFeedbackDoc(
  leadId: string,
  uid: string,
  rating: number,
  feedback: string
): Promise<void> {
  const ref = db.collection('leads').doc(leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');
  assertOwner(uid, lead);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpsError('invalid-argument', 'Rating must be a whole number from 1 to 5.');
  }
  assertTransition(lead.status, 'rated');
  const now = Date.now();
  await ref.update({ rating, feedback, status: 'rated', 'timestamps.rated': now, updatedAt: now });
  await logEventDoc({ type: 'result_rated', leadId, meta: { rating } });
}

export const submitFeedback = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  await submitFeedbackDoc(req.data.leadId, req.auth.uid, req.data.rating, req.data.feedback);
  return { ok: true };
});

export async function submitBookingDoc(
  leadId: string,
  uid: string,
  booking: NonNullable<Lead['booking']>
): Promise<void> {
  const ref = db.collection('leads').doc(leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');
  assertOwner(uid, lead);
  if (booking.interest !== undefined && !BOOKING_INTERESTS.includes(booking.interest)) {
    throw new HttpsError('invalid-argument', 'Unknown booking interest');
  }
  assertTransition(lead.status, 'booked');
  const now = Date.now();
  await ref.update({ booking, status: 'booked', 'timestamps.booked': now, updatedAt: now });
  await logEventDoc({ type: 'booking_submitted', leadId });
}

export const submitBooking = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  await submitBookingDoc(req.data.leadId, req.auth.uid, req.data.booking);
  return { ok: true };
});

export async function regenerateDoc(
  leadId: string,
  uid: string,
  opts?: { isAdmin?: boolean }
): Promise<void> {
  const ref = db.collection('leads').doc(leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) throw new HttpsError('not-found', 'Lead not found');

  if (opts?.isAdmin) {
    // Admins may re-run a failed generation too, but never a lead that's
    // been paid/booked but not yet generated, or already booked.
    if (lead.status !== 'generated' && lead.status !== 'rated' && lead.status !== 'failed') {
      throw new HttpsError('failed-precondition', 'Regeneration is only available after your first design is ready.');
    }
    await runGeneration(leadId);
    return;
  }

  assertOwner(uid, lead);
  // Owners may only retry a FAILED first preview (WaitScreen "Try again").
  // Trying new looks on a successful lead goes through `restyle` and the
  // Room Pass, which replaced the old one-free-regenerate rule.
  if (lead.status !== 'failed') {
    throw new HttpsError('failed-precondition', 'Use a restyle from your Room Pass to try another look.');
  }
  await runGeneration(leadId);
}

export const regenerate = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  const isAdmin = req.auth.token?.admin === true;
  await regenerateDoc(req.data.leadId, req.auth.uid, { isAdmin });
  return { ok: true };
});
