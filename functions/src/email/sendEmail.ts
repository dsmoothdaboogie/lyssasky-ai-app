import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../admin';
import { loadConfig } from '../config';
import { escapeHtml, renderBookingHtml, type EmailLabels } from './templates';
import type { Lead, MailDocument, Style } from '../../../src/domain/types';

/**
 * Writes a document to the `mail` collection in the exact shape the Firebase
 * "Trigger Email" extension consumes (the `message.{subject,html}` nesting
 * is what it reads). This is the mock-mode substitute for actually sending
 * mail: the extension itself (or a mock) is wired up separately at go-live.
 */
export async function sendEmailDoc(input: {
  to: string;
  subject: string;
  html: string;
  kind: MailDocument['kind'];
  leadId?: string;
}): Promise<void> {
  const { to, subject, html, kind, leadId } = input;
  await db.collection('mail').add(<MailDocument>{
    to,
    message: { subject, html },
    createdAt: Date.now(),
    kind,
    leadId,
  });
}

export { escapeHtml };

export async function loadEmailLabels(): Promise<EmailLabels> {
  const [stylesSnap, config] = await Promise.all([db.collection('styles').get(), loadConfig()]);
  const names = new Map(stylesSnap.docs.map((d) => [(d.data() as Style).slug, (d.data() as Style).name]));
  const moods = new Map(
    (config.questionnaire.find((q) => q.id === 'colorMood')?.options ?? []).map((o) => [o.value, o.label]),
  );
  return { styleName: (s) => names.get(s) ?? s, moodLabel: (v) => moods.get(v) ?? v };
}

/**
 * Firestore triggers are delivered at-least-once, so the same booked
 * transition can invoke onLeadBooked more than once (a redelivery, or two
 * near-simultaneous deliveries). Claim the notification inside a transaction —
 * mirroring claimLeadForGeneration in generation/runGeneration.ts — reading
 * the *live* doc and setting `bookingNotifiedAt` only if it isn't already set,
 * so a redelivery can never queue a second briefing email. Returns the claimed
 * lead (for rendering) or null if there's nothing to send.
 */
async function claimBookingNotification(leadId: string): Promise<Lead | null> {
  const ref = db.collection('leads').doc(leadId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lead = snap.data() as Lead | undefined;
    if (!lead || lead.status !== 'booked' || lead.bookingNotifiedAt) return null;
    tx.update(ref, { bookingNotifiedAt: Date.now() });
    return lead;
  });
}

/**
 * Composes and queues the "new booking" briefing email to Marjorie. The claim
 * above both dedupes redelivered triggers and hands back the live lead, so this
 * stays independently testable/callable, mirroring handleLeadPaid in
 * generation/runGeneration.ts.
 */
export async function handleLeadBooked(leadId: string): Promise<void> {
  const lead = await claimBookingNotification(leadId);
  if (!lead) return;

  const config = await loadConfig();
  const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  const html = renderBookingHtml(leadId, lead, appBaseUrl, await loadEmailLabels());
  await sendEmailDoc({
    to: config.notifyEmail,
    subject: `New booking from ${lead.email ?? 'a customer'}`,
    html,
    kind: 'booking_notification',
    leadId,
  });
}

export const onLeadBooked = onDocumentUpdated('leads/{leadId}', async (event) => {
  const before = event.data?.before.data() as Lead | undefined;
  const after = event.data?.after.data() as Lead | undefined;
  if (before?.status !== 'booked' && after?.status === 'booked') {
    try {
      await handleLeadBooked(event.params.leadId);
    } catch (err) {
      // A mail-composition failure must never throw out of this trigger:
      // the booking itself already succeeded, and a stuck trigger would
      // just keep retrying against the same doc pointlessly.
      console.error(`onLeadBooked: failed to send booking notification for lead ${event.params.leadId}`, err);
    }
  }
});
