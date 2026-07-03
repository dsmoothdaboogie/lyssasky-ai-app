import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, functions, storage } from './client';
import type {
  AnalyticsEventType,
  Lead,
  QuestionnaireAnswers,
} from '../domain/types';

type Ok = { ok: true };

export async function apiCreateLead(): Promise<{ leadId: string; leadToken: string }> {
  const fn = httpsCallable<void, { leadId: string; leadToken: string }>(functions, 'createLead');
  const res = await fn();
  return res.data;
}

export async function apiUpdateLeadAnswers(
  leadId: string,
  answers: QuestionnaireAnswers,
  email: string
): Promise<Ok> {
  const fn = httpsCallable<
    { leadId: string; answers: QuestionnaireAnswers; email: string },
    Ok
  >(functions, 'updateLeadAnswers');
  const res = await fn({ leadId, answers, email });
  return res.data;
}

export async function apiStartCheckout(leadId: string): Promise<{ checkoutUrl: string }> {
  const fn = httpsCallable<{ leadId: string }, { checkoutUrl: string }>(functions, 'startCheckout');
  const res = await fn({ leadId });
  return res.data;
}

export async function apiConfirmPaymentMock(leadId: string, sessionId: string): Promise<Ok> {
  const fn = httpsCallable<{ leadId: string; sessionId: string }, Ok>(
    functions,
    'confirmPaymentMock'
  );
  const res = await fn({ leadId, sessionId });
  return res.data;
}

export async function apiAttachPhoto(leadId: string, path: string): Promise<Ok> {
  const fn = httpsCallable<{ leadId: string; path: string }, Ok>(functions, 'attachPhoto');
  const res = await fn({ leadId, path });
  return res.data;
}

export async function apiSubmitFeedback(
  leadId: string,
  rating: number,
  feedback: string
): Promise<Ok> {
  const fn = httpsCallable<{ leadId: string; rating: number; feedback: string }, Ok>(
    functions,
    'submitFeedback'
  );
  const res = await fn({ leadId, rating, feedback });
  return res.data;
}

export async function apiSubmitBooking(
  leadId: string,
  booking: NonNullable<Lead['booking']>
): Promise<Ok> {
  const fn = httpsCallable<{ leadId: string; booking: NonNullable<Lead['booking']> }, Ok>(
    functions,
    'submitBooking'
  );
  const res = await fn({ leadId, booking });
  return res.data;
}

export async function apiRegenerate(leadId: string): Promise<Ok> {
  const fn = httpsCallable<{ leadId: string }, Ok>(functions, 'regenerate');
  const res = await fn({ leadId });
  return res.data;
}

export async function apiLogEvent(
  type: AnalyticsEventType,
  leadId?: string,
  meta?: Record<string, string | number | boolean>
): Promise<Ok> {
  const fn = httpsCallable<
    { type: AnalyticsEventType; leadId?: string; meta?: Record<string, string | number | boolean> },
    Ok
  >(functions, 'logEvent');
  const res = await fn({ type, leadId, meta });
  return res.data;
}

export function watchLead(leadId: string, cb: (lead: Lead | undefined) => void): () => void {
  return onSnapshot(doc(db, 'leads', leadId), (snap) => {
    cb(snap.exists() ? (snap.data() as Lead) : undefined);
  });
}

export async function uploadOriginalPhoto(uid: string, file: File): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const path = `leads/${uid}/original.${ext}`;
  await uploadBytes(ref(storage, path), file);
  return path;
}
