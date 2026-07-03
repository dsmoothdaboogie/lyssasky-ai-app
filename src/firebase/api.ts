import { httpsCallable } from 'firebase/functions';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, functions, storage } from './client';
import type {
  AnalyticsEventType,
  AppConfig,
  Lead,
  QuestionnaireAnswers,
  Style,
} from '../domain/types';
import { DEFAULT_CONFIG } from '../config/defaultConfig';

type Ok = { ok: true };

/**
 * `config/app` is world-readable per firestore.rules. Falls back to
 * DEFAULT_CONFIG if the document hasn't been seeded yet.
 */
export async function fetchAppConfig(): Promise<AppConfig> {
  const snap = await getDoc(doc(db, 'config', 'app'));
  return snap.exists() ? (snap.data() as AppConfig) : DEFAULT_CONFIG;
}

/**
 * `styles` is world-readable per firestore.rules. Fetches active styles
 * ordered by sortOrder. If the compound where+orderBy query ever needs a
 * composite index that isn't provisioned (e.g. a fresh emulator), fall back
 * to filtering client-side and sorting in JS.
 */
export async function fetchActiveStyles(): Promise<Style[]> {
  try {
    const q = query(collection(db, 'styles'), where('active', '==', true), orderBy('sortOrder'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Style);
  } catch {
    const snap = await getDocs(collection(db, 'styles'));
    return snap.docs
      .map((d) => d.data() as Style)
      .filter((s) => s.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

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

/**
 * One-shot read of a lead doc. Per firestore.rules the owner (matching
 * `ownerUid`) or an admin may read a lead directly.
 */
export async function fetchLead(leadId: string): Promise<Lead | undefined> {
  const snap = await getDoc(doc(db, 'leads', leadId));
  return snap.exists() ? (snap.data() as Lead) : undefined;
}

/**
 * Resolves a Storage path (e.g. a lead's original/generated photo) to a
 * viewable download URL. Works against both the emulator and production.
 */
export async function getImageUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

export async function uploadOriginalPhoto(uid: string, file: File): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const path = `leads/${uid}/original.${ext}`;
  await uploadBytes(ref(storage, path), file);
  return path;
}
