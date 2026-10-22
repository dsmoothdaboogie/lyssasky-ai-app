import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../admin';
import { DAY_MS } from '../../../src/domain/pass';
import { sendEmailDoc, loadEmailLabels } from './sendEmail';
import { renderPassExpiringHtml, resultUrlFor } from './templates';
import type { Lead } from '../../../src/domain/types';

/** Claims the reminder transactionally so overlapping runs never double-send. */
async function claimReminder(leadId: string): Promise<Lead | null> {
  const ref = db.collection('leads').doc(leadId);
  return db.runTransaction(async (tx) => {
    const lead = (await tx.get(ref)).data() as Lead | undefined;
    if (!lead || lead.remindedAt || lead.booking || !lead.email) return null;
    tx.update(ref, { remindedAt: Date.now() });
    return lead;
  });
}

export async function sendPassReminders(now: number): Promise<number> {
  const snap = await db.collection('leads')
    .where('pass.expiresAt', '>', now)
    .where('pass.expiresAt', '<=', now + DAY_MS)
    .get();
  const candidates = snap.docs.filter((d) => {
    const l = d.data() as Lead;
    return !l.remindedAt && !l.booking && !!l.email;
  });
  if (candidates.length === 0) return 0;

  const labels = await loadEmailLabels();
  const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  let sent = 0;
  for (const doc of candidates) {
    try {
      const lead = await claimReminder(doc.id);
      if (!lead) continue;
      await sendEmailDoc({
        to: lead.email!,
        subject: 'Your Room Pass ends tomorrow',
        html: renderPassExpiringHtml(lead, resultUrlFor(doc.id, lead, appBaseUrl), labels),
        kind: 'pass_expiring',
        leadId: doc.id,
      });
      sent += 1;
    } catch (err) {
      console.error(`sendPassReminders: lead ${doc.id} failed`, err);
    }
  }
  return sent;
}

export const passReminderSchedule = onSchedule('every 60 minutes', async () => {
  await sendPassReminders(Date.now());
});
