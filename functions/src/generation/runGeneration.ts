import { randomUUID } from 'crypto';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, storage } from '../admin';
import { loadConfig } from '../config';
import { buildGenerationPrompt } from '../../../src/domain/prompt';
import { assertTransition } from '../../../src/domain/leadStatus';
import { logEventDoc } from '../events';
import { createMockGenerationProvider } from './mockProvider';
import { createGeminiGenerationProvider } from './geminiProvider';
import type { GenerationProvider } from './provider';
import type { Lead, Style, StyleRecipe, GenerationRecord } from '../../../src/domain/types';

async function resolveProvider(): Promise<GenerationProvider> {
  const cfg = await loadConfig();
  if (cfg.generationMode === 'gemini' && process.env.GEMINI_API_KEY) {
    return createGeminiGenerationProvider(process.env.GEMINI_API_KEY);
  }
  return createMockGenerationProvider();
}

export async function runGeneration(leadId: string, provider?: GenerationProvider) {
  const gen = provider ?? (await resolveProvider());
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

    const bucket = storage.bucket();
    const [photoBytes] = await bucket.file(lead.originalPhotoPath).download();
    const start = Date.now();
    let out; let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { out = await gen.generate({ photoBytes, mimeType: 'image/jpeg', prompt }); break; }
      catch (e) { lastErr = e; }
    }
    const durationMs = Date.now() - start;

    if (!out) throw new Error(String(lastErr));

    const genId = randomUUID();
    const outputPath = `leads/${lead.ownerUid}/generated/${Date.now()}.png`;
    await bucket.file(outputPath).save(out.imageBytes, { contentType: out.mimeType });
    await db.collection('generations').doc(genId).set(<GenerationRecord>{
      id: genId, leadId, source: 'funnel', styleSlug, recipeSnapshot,
      promptSnapshot, inputPhotoPath: lead.originalPhotoPath, outputPhotoPath: outputPath,
      durationMs, costEstimate: out.costEstimate, status: 'success', createdAt: Date.now(),
    });
    assertTransition(lead.status, 'generated');
    await ref.update({
      status: 'generated',
      generatedImagePaths: [...lead.generatedImagePaths, outputPath],
      costEstimateTotal: lead.costEstimateTotal + out.costEstimate,
      'timestamps.generated': Date.now(), updatedAt: Date.now(),
    });
    await logEventDoc({ type: 'generation_completed', leadId, meta: { durationMs } });
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
