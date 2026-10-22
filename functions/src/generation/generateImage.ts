import { storage } from '../admin';
import { loadConfig } from '../config';
import { createMockGenerationProvider } from './mockProvider';
import { createGeminiGenerationProvider } from './geminiProvider';
import type { GenerationProvider } from './provider';
import { applyWatermark } from './watermark';

export async function resolveProvider(): Promise<GenerationProvider> {
  const cfg = await loadConfig();
  if (cfg.generationMode === 'gemini' && process.env.GEMINI_API_KEY) {
    return createGeminiGenerationProvider(process.env.GEMINI_API_KEY);
  }
  return createMockGenerationProvider();
}

/** Two attempts at this bound finish well inside the 120s function timeout, so the caller can still refund. */
export const PROVIDER_ATTEMPT_TIMEOUT_MS = 50_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Provider attempt timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export interface GenerateImageInput {
  inputPhotoPath: string;
  prompt: string;
  provider?: GenerationProvider;
  outputDir?: string;
  watermark?: boolean;
  /** Per provider attempt; defaults to PROVIDER_ATTEMPT_TIMEOUT_MS. */
  attemptTimeoutMs?: number;
}

export interface GenerateImageResult {
  outputPhotoPath: string;
  mimeType: string;
  durationMs: number;
  costEstimate: number;
  watermarkFailed: boolean;
}

/**
 * Shared download -> provider -> save core used by both runGeneration (the
 * payment-triggered path) and the Phase 2 test bench. This function throws
 * if every attempt fails; it is up to the caller to decide how to handle
 * that (runGeneration wraps this in its own try/catch and routes failures
 * to the lead's 'failed' status without ever throwing itself).
 */
export async function generateImage(input: GenerateImageInput): Promise<GenerateImageResult> {
  const gen = input.provider ?? (await resolveProvider());
  const outputDir = input.outputDir ?? 'testbench/results';

  const bucket = storage.bucket();
  const [photoBytes] = await bucket.file(input.inputPhotoPath).download();

  const start = Date.now();
  let out; let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      out = await withTimeout(
        gen.generate({ photoBytes, mimeType: 'image/jpeg', prompt: input.prompt }),
        input.attemptTimeoutMs ?? PROVIDER_ATTEMPT_TIMEOUT_MS,
      );
      break;
    }
    catch (e) { lastErr = e; }
  }
  const durationMs = Date.now() - start;

  if (!out) throw new Error(String(lastErr));

  let imageBytes = out.imageBytes;
  let mimeType = out.mimeType;
  let watermarkFailed = false;
  if (input.watermark) {
    try {
      imageBytes = await applyWatermark(out.imageBytes);
      mimeType = 'image/png';
    } catch (err) {
      // Never cost the customer an image over a cosmetic step.
      console.error('generateImage: watermark failed, saving unwatermarked image', err);
      watermarkFailed = true;
    }
  }

  const outputPhotoPath = `${outputDir}/${Date.now()}.png`;
  await bucket.file(outputPhotoPath).save(imageBytes, { contentType: mimeType });

  return { outputPhotoPath, mimeType, durationMs, costEstimate: out.costEstimate, watermarkFailed };
}
