import { randomUUID } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../admin';
import { assertAdmin } from '../guards';
import { buildGenerationPrompt } from '../../../src/domain/prompt';
import { generateImage } from '../generation/generateImage';
import type { Style, StyleRecipe, QuestionnaireAnswers, GenerationRecord } from '../../../src/domain/types';

const DEFAULT_TESTBENCH_ANSWERS_BASE: Omit<QuestionnaireAnswers, 'styleSlug'> = {
  roomType: 'living_room',
  colorMood: 'warm_cozy',
  budget: '1k_5k',
  timeline: 'just_dreaming',
};

export interface AdminTestBenchGenerateInput {
  inputPhotoPath: string;
  styleSlug?: string;
  inlineRecipe?: StyleRecipe;
  styleName?: string;
  answers?: Partial<QuestionnaireAnswers>;
}

export async function adminTestBenchGenerateDoc(
  input: AdminTestBenchGenerateInput,
): Promise<{ generationId: string; outputPhotoPath: string }> {
  let name: string;
  let recipe: StyleRecipe;
  let styleSlug: string;

  if (input.styleSlug) {
    const style = (await db.collection('styles').doc(input.styleSlug).get()).data() as Style | undefined;
    if (!style) throw new HttpsError('invalid-argument', `Unknown style ${input.styleSlug}`);
    name = style.name;
    recipe = style.recipe;
    styleSlug = style.slug;
  } else {
    if (!input.inlineRecipe || !input.styleName) {
      throw new HttpsError('invalid-argument', 'Either styleSlug or both inlineRecipe and styleName are required');
    }
    name = input.styleName;
    recipe = input.inlineRecipe;
    styleSlug = 'inline';
  }

  const DEFAULT_TESTBENCH_ANSWERS: QuestionnaireAnswers = { ...DEFAULT_TESTBENCH_ANSWERS_BASE, styleSlug };
  const answers: QuestionnaireAnswers = { ...DEFAULT_TESTBENCH_ANSWERS, ...(input.answers ?? {}) };

  const prompt = buildGenerationPrompt({ name, recipe }, answers);
  const out = await generateImage({
    inputPhotoPath: input.inputPhotoPath,
    prompt,
    outputDir: 'testbench/results',
  });

  const id = randomUUID();
  await db.collection('generations').doc(id).set(<GenerationRecord>{
    id, leadId: '', source: 'testbench', styleSlug, recipeSnapshot: recipe,
    promptSnapshot: prompt, inputPhotoPath: input.inputPhotoPath, outputPhotoPath: out.outputPhotoPath,
    durationMs: out.durationMs, costEstimate: out.costEstimate, status: 'success', createdAt: Date.now(),
  });

  return { generationId: id, outputPhotoPath: out.outputPhotoPath };
}

export const adminTestBenchGenerate = onCall(async (req) => {
  assertAdmin(req.auth);
  return adminTestBenchGenerateDoc(req.data as AdminTestBenchGenerateInput);
});
