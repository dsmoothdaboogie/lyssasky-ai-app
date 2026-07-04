import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../admin';
import { loadConfig } from '../config';
import type { Lead, MailDocument } from '../../../src/domain/types';

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

function renderBookingHtml(leadId: string, lead: Lead): string {
  const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  const leadUrl = `${appBaseUrl}/admin/leads/${leadId}`;
  const answersList = lead.answers
    ? Object.entries(lead.answers)
        .map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`)
        .join('')
    : '<li>No questionnaire answers on file</li>';
  const booking = lead.booking;

  return `
    <h2>New booking from ${lead.email ?? 'unknown customer'}</h2>
    <p><strong>Customer email:</strong> ${lead.email ?? 'n/a'}</p>
    <h3>Questionnaire answers</h3>
    <ul>${answersList}</ul>
    <h3>Feedback on the design</h3>
    <p><strong>Rating:</strong> ${lead.rating ?? 'n/a'}</p>
    <p><strong>What would you change:</strong> ${lead.feedback ?? 'n/a'}</p>
    <h3>Booking details</h3>
    <p><strong>Name:</strong> ${booking?.name ?? 'n/a'}</p>
    <p><strong>Phone:</strong> ${booking?.phone ?? 'n/a'}</p>
    <p><strong>Note:</strong> ${booking?.note ?? 'n/a'}</p>
    <p><a href="${leadUrl}">${leadUrl}</a></p>
  `.trim();
}

/**
 * Composes and queues the "new booking" briefing email to Marjorie. Loads
 * the lead fresh (rather than trusting the trigger's `after` snapshot) so
 * this stays independently testable/callable, mirroring handleLeadPaid in
 * generation/runGeneration.ts.
 */
export async function handleLeadBooked(leadId: string): Promise<void> {
  const lead = (await db.collection('leads').doc(leadId).get()).data() as Lead | undefined;
  if (!lead) return;

  const config = await loadConfig();
  const html = renderBookingHtml(leadId, lead);
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
