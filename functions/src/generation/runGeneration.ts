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
import type { Lead, Style, GenerationRecord } from '../../../src/domain/types';

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
  if (!lead || !lead.answers || !lead.originalPhotoPath) return;
  const style = (await db.collection('styles').doc(lead.answers.styleSlug).get()).data() as Style | undefined;
  if (!style) throw new Error(`Unknown style ${lead.answers.styleSlug}`);
  const prompt = buildGenerationPrompt({ name: style.name, recipe: style.recipe }, lead.answers);
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
  const genId = randomUUID();

  if (!out) {
    await ref.update({ status: 'failed', 'timestamps.failed': Date.now(), updatedAt: Date.now() });
    await db.collection('generations').doc(genId).set(<GenerationRecord>{
      id: genId, leadId, source: 'funnel', styleSlug: style.slug, recipeSnapshot: style.recipe,
      promptSnapshot: prompt, inputPhotoPath: lead.originalPhotoPath, durationMs, costEstimate: 0,
      status: 'failed', error: String(lastErr), createdAt: Date.now(),
    });
    return;
  }

  const outputPath = `leads/${lead.ownerUid}/generated/${Date.now()}.png`;
  await bucket.file(outputPath).save(out.imageBytes, { contentType: out.mimeType });
  await db.collection('generations').doc(genId).set(<GenerationRecord>{
    id: genId, leadId, source: 'funnel', styleSlug: style.slug, recipeSnapshot: style.recipe,
    promptSnapshot: prompt, inputPhotoPath: lead.originalPhotoPath, outputPhotoPath: outputPath,
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
}

export const onLeadPaid = onDocumentUpdated('leads/{leadId}', async (event) => {
  const before = event.data?.before.data() as Lead | undefined;
  const after = event.data?.after.data() as Lead | undefined;
  if (before?.status !== 'paid' && after?.status === 'paid') {
    await runGeneration(event.params.leadId);
  }
});
