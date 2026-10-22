import { randomUUID } from 'crypto';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db } from '../admin';
import { buildGenerationPrompt } from '../../../src/domain/prompt';
import { assertTransition } from '../../../src/domain/leadStatus';
import { logEventDoc } from '../events';
import { sendEmailDoc } from '../email/sendEmail';
import { renderResultReadyHtml, resultUrlFor } from '../email/templates';
import { generateImage } from './generateImage';
import type { GenerationProvider } from './provider';
import type { Lead, Look, QuestionnaireAnswers, Style, StyleRecipe, GenerationRecord } from '../../../src/domain/types';

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
    const html = renderResultReadyHtml(lead, resultUrlFor(leadId, lead, appBaseUrl));
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

export interface LookResult {
  outputPhotoPath: string;
  costEstimate: number;
  durationMs: number;
}

/**
 * Shared generation core for the first preview and restyles: style lookup,
 * prompt build, generate (+ watermark), and the GenerationRecord write — for
 * success AND failure. Throws on failure (after recording it); callers own
 * the lead-doc update and failure semantics.
 */
export async function generateLook(
  leadId: string,
  lead: Lead,
  answers: QuestionnaireAnswers,
  provider?: GenerationProvider,
  attemptTimeoutMs?: number,
): Promise<LookResult> {
  let styleSlug = answers.styleSlug ?? 'unknown';
  let recipeSnapshot: StyleRecipe = { description: '', materials: '', palette: '', furniture: '', avoid: '' };
  let promptSnapshot = '';
  const inputPhotoPath = lead.originalPhotoPath ?? '';
  try {
    if (!lead.originalPhotoPath) throw new Error(`Lead ${leadId} has no originalPhotoPath`);
    const style = (await db.collection('styles').doc(answers.styleSlug).get()).data() as Style | undefined;
    if (!style) throw new Error(`Unknown style ${answers.styleSlug}`);
    styleSlug = style.slug;
    recipeSnapshot = style.recipe;
    promptSnapshot = buildGenerationPrompt({ name: style.name, recipe: style.recipe }, answers);
    await logEventDoc({ type: 'generation_started', leadId });

    const { outputPhotoPath, durationMs, costEstimate, watermarkFailed } = await generateImage({
      inputPhotoPath: lead.originalPhotoPath,
      prompt: promptSnapshot,
      provider,
      attemptTimeoutMs,
      outputDir: `leads/${lead.ownerUid}/generated`,
      watermark: true,
    });
    const genId = randomUUID();
    await db.collection('generations').doc(genId).set(<GenerationRecord>{
      id: genId, leadId, source: 'funnel', styleSlug, recipeSnapshot,
      promptSnapshot, inputPhotoPath, outputPhotoPath,
      durationMs, costEstimate, status: 'success', watermarkFailed, createdAt: Date.now(),
    });
    await logEventDoc({ type: 'generation_completed', leadId, meta: { durationMs } });
    return { outputPhotoPath, costEstimate, durationMs };
  } catch (err) {
    try {
      const genId = randomUUID();
      await db.collection('generations').doc(genId).set(<GenerationRecord>{
        id: genId, leadId, source: 'funnel', styleSlug, recipeSnapshot,
        promptSnapshot, inputPhotoPath, durationMs: 0, costEstimate: 0,
        status: 'failed', error: String(err), createdAt: Date.now(),
      });
    } catch { /* recording the failure must not mask it */ }
    throw err;
  }
}

export async function runGeneration(leadId: string, provider?: GenerationProvider) {
  const ref = db.collection('leads').doc(leadId);
  const lead = (await ref.get()).data() as Lead | undefined;
  if (!lead) return;

  // Hard requirement: runGeneration must NEVER throw (see onLeadPaid) — a
  // thrown error would strand a PAID lead at 'paid' with no admin signal.
  try {
    if (!lead.answers) throw new Error(`Lead ${leadId} is missing answers; cannot run generation`);
    const { outputPhotoPath, costEstimate } = await generateLook(leadId, lead, lead.answers, provider);
    assertTransition(lead.status, 'generated');
    const now = Date.now();
    const look: Look = {
      imagePath: outputPhotoPath, styleSlug: lead.answers.styleSlug,
      colorMood: lead.answers.colorMood, createdAt: now,
    };
    await ref.update({
      status: 'generated',
      generatedImagePaths: [...lead.generatedImagePaths, outputPhotoPath],
      looks: [...(lead.looks ?? []), look],
      costEstimateTotal: lead.costEstimateTotal + costEstimate,
      'timestamps.generated': now, updatedAt: now,
    });
    // Only the FIRST successful preview emails the customer: `lead` is the
    // pre-run snapshot, so a regenerate/retry-after-success must not re-send.
    if (lead.generatedImagePaths.length === 0) {
      await sendResultReadyEmail(leadId, lead);
    }
  } catch (err) {
    // generateLook records its own failed GenerationRecord. If we never got
    // that far (no answers), record one here to keep the existing contract.
    // Direct update (no assertTransition) so this handler itself can't throw.
    try {
      if (!lead.answers) {
        const genId = randomUUID();
        await db.collection('generations').doc(genId).set(<GenerationRecord>{
          id: genId, leadId, source: 'funnel', styleSlug: 'unknown',
          recipeSnapshot: { description: '', materials: '', palette: '', furniture: '', avoid: '' },
          promptSnapshot: '', inputPhotoPath: lead.originalPhotoPath ?? '', durationMs: 0, costEstimate: 0,
          status: 'failed', error: String(err), createdAt: Date.now(),
        });
      }
      await ref.update({ status: 'failed', 'timestamps.failed': Date.now(), updatedAt: Date.now() });
    } catch { /* must not escape */ }
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
