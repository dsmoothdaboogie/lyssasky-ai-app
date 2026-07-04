import { randomUUID } from 'crypto';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../admin';
import { buildGenerationPrompt } from '../../../src/domain/prompt';
import { assertTransition } from '../../../src/domain/leadStatus';
import { logEventDoc } from '../events';
import { sendEmailDoc, escapeHtml } from '../email/sendEmail';
import { generateImage } from './generateImage';
import type { GenerationProvider } from './provider';
import type { Lead, Style, StyleRecipe, GenerationRecord } from '../../../src/domain/types';

/**
 * Best-effort "your room preview is ready" email to the customer, fired once
 * a funnel-sourced generation succeeds and the lead has an email on file
 * (captured earlier in the questionnaire step — a lead reached via the
 * test-bench never has one). The link carries the lead's opaque `leadToken`
 * so it works from a brand-new device/browser where a fresh anonymous auth
 * uid wouldn't otherwise satisfy the lead's ownership check (see
 * `getResultByTokenDoc` in `../result.ts`).
 *
 * Wrapped in its own try/catch — separate from the outer runGeneration
 * try/catch — so a mail-composition failure can never be mistaken for a
 * generation failure and flip an already-succeeded lead to 'failed'.
 */
async function sendResultReadyEmail(leadId: string, lead: Lead): Promise<void> {
  if (!lead.email) return;
  try {
    const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
    const resultUrl = `${appBaseUrl}/result?lead=${encodeURIComponent(leadId)}&token=${encodeURIComponent(lead.leadToken)}`;
    const html = `
      <h2>Your room preview is ready! ✨</h2>
      <p>Marjorie's AI stylist has finished reimagining your space. Take a look:</p>
      <p><a href="${resultUrl}">${escapeHtml(resultUrl)}</a></p>
    `.trim();
    await sendEmailDoc({
      to: lead.email,
      subject: 'Your room preview is ready ✨',
      html,
      kind: 'result_ready',
      leadId,
    });
  } catch (err) {
    console.error(`runGeneration: failed to send result-ready email for lead ${leadId}`, err);
  }
}

export async function runGeneration(leadId: string, provider?: GenerationProvider) {
  const ref = db.collection('leads').doc(leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  // Nothing to do if the lead doc itself doesn't exist.
  if (!lead) return;

  // This is a hard requirement: runGeneration must NEVER throw. A thrown
  // error here would escape the onLeadPaid trigger and strand an
  // already-PAID lead at status:'paid' forever, with no failure record and
  // no admin signal. Every step below — style lookup, prompt build, photo
  // download, the provider call (with its retry), the Storage save, the
  // generations write, and the lead status update — is covered by this one
  // try/catch so any failure routes through the same failure path.
  //
  // We track whatever context we've learned so far so the failure record
  // can be as informative as possible even if we fail early (e.g. before a
  // style doc was ever loaded).
  let styleSlug = lead.answers?.styleSlug ?? 'unknown';
  let recipeSnapshot: StyleRecipe = { description: '', materials: '', palette: '', furniture: '', avoid: '' };
  let promptSnapshot = '';
  const inputPhotoPath = lead.originalPhotoPath ?? '';

  try {
    if (!lead.answers || !lead.originalPhotoPath) {
      throw new Error(`Lead ${leadId} is missing answers or originalPhotoPath; cannot run generation`);
    }
    const style = (await db.collection('styles').doc(lead.answers.styleSlug).get()).data() as Style | undefined;
    if (!style) throw new Error(`Unknown style ${lead.answers.styleSlug}`);
    styleSlug = style.slug;
    recipeSnapshot = style.recipe;
    const prompt = buildGenerationPrompt({ name: style.name, recipe: style.recipe }, lead.answers);
    promptSnapshot = prompt;
    await logEventDoc({ type: 'generation_started', leadId });

    const { outputPhotoPath, durationMs, costEstimate } = await generateImage({
      inputPhotoPath: lead.originalPhotoPath,
      prompt,
      provider,
      outputDir: `leads/${lead.ownerUid}/generated`,
    });

    const genId = randomUUID();
    await db.collection('generations').doc(genId).set(<GenerationRecord>{
      id: genId, leadId, source: 'funnel', styleSlug, recipeSnapshot,
      promptSnapshot, inputPhotoPath: lead.originalPhotoPath, outputPhotoPath,
      durationMs, costEstimate, status: 'success', createdAt: Date.now(),
    });
    assertTransition(lead.status, 'generated');
    await ref.update({
      status: 'generated',
      generatedImagePaths: [...lead.generatedImagePaths, outputPhotoPath],
      costEstimateTotal: lead.costEstimateTotal + costEstimate,
      'timestamps.generated': Date.now(), updatedAt: Date.now(),
    });
    await logEventDoc({ type: 'generation_completed', leadId, meta: { durationMs } });
    await sendResultReadyEmail(leadId, lead);
  } catch (err) {
    // Route ANY failure above to the same terminal state. We deliberately
    // do NOT call assertTransition here: if the lead's current status is
    // unexpected, assertTransition would throw and this failure handler
    // itself would escape, re-breaking the no-throw guarantee we exist to
    // provide. A direct update is used instead.
    try {
      const genId = randomUUID();
      await db.collection('generations').doc(genId).set(<GenerationRecord>{
        id: genId, leadId, source: 'funnel', styleSlug, recipeSnapshot,
        promptSnapshot, inputPhotoPath, durationMs: 0, costEstimate: 0,
        status: 'failed', error: String(err), createdAt: Date.now(),
      });
      await ref.update({ status: 'failed', 'timestamps.failed': Date.now(), updatedAt: Date.now() });
    } catch {
      // Even the failure-path writes must not escape runGeneration.
    }
  }
}

/**
 * Firestore triggers are delivered at-least-once, so the same 'paid'
 * transition can invoke this handler more than once (e.g. a redelivery after
 * a transient error, or two near-simultaneous deliveries of the same
 * event). Without a guard, a redelivery would call runGeneration a second
 * time and append a second generated image / double the cost estimate.
 *
 * We claim the lead inside a Firestore transaction: it reads the *live*
 * document (not the trigger's before/after snapshot, which can be stale by
 * the time a redelivery runs) and only proceeds if the lead is still
 * 'paid' and hasn't already been claimed. Firestore serializes conflicting
 * transactions on the same document — if two claims race, only one commits
 * and the other's transaction retries against the now-claimed document and
 * bails out.
 */
async function claimLeadForGeneration(leadId: string): Promise<boolean> {
  const ref = db.collection('leads').doc(leadId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lead = snap.data() as Lead | undefined;
    if (!lead || lead.status !== 'paid' || lead.generationClaimedAt) return false;
    tx.update(ref, { generationClaimedAt: Date.now() });
    return true;
  });
}

export async function handleLeadPaid(leadId: string): Promise<void> {
  const claimed = await claimLeadForGeneration(leadId);
  if (!claimed) return;
  await runGeneration(leadId);
}

export const onLeadPaid = onDocumentUpdated('leads/{leadId}', async (event) => {
  const before = event.data?.before.data() as Lead | undefined;
  const after = event.data?.after.data() as Lead | undefined;
  if (before?.status !== 'paid' && after?.status === 'paid') {
    await handleLeadPaid(event.params.leadId);
  }
});
