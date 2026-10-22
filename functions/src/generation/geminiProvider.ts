import type { GenerationProvider } from './provider';
// Uses @google/genai image editing via `ai.models.generateContent`.
//
// SDK call shape verified against context7 JS/TS docs
// (/websites/googleapis_github_io_js-genai) — confirmed current:
//  - Request: `ai.models.generateContent({ model, contents })` where `contents` mixes
//    `{ inlineData: { data: base64, mimeType } }` (input image) and `{ text: prompt }`
//    parts. Field names are camelCase (`inlineData`, `mimeType`) on this surface.
//  - Response: generated image at `res.candidates[0].content.parts[].inlineData.data`
//    (base64) with a sibling `inlineData.mimeType`.
//
// The MODEL ID is the one thing that cannot be verified without a live key, and Google
// revises image model ids periodically. It is therefore an env override
// (GEMINI_IMAGE_MODEL) so the first smoke test can swap ids without a code change /
// rebuild — just edit functions/.env.local and restart the emulator.
//   default:   gemini-3.1-flash-image   (per last docs check)
//   fallbacks: gemini-2.5-flash-image   (older "nano banana", known-stable)
//              gemini-3-pro-image-preview / gemini-3.1-flash-lite-image (quality/cost tiers)
// If the default 404s on the live run, set GEMINI_IMAGE_MODEL to a fallback and re-check
// https://ai.google.dev/gemini-api/docs/image-generation.
const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';

export function createGeminiGenerationProvider(apiKey: string): GenerationProvider {
  return {
    async generate({ photoBytes, mimeType, prompt }) {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.generateContent({
        model: process.env.GEMINI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
        contents: [
          { inlineData: { data: photoBytes.toString('base64'), mimeType } },
          { text: prompt },
        ],
      });
      const part = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
      if (!part?.inlineData?.data) throw new Error('Gemini returned no image');
      return {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        imageBytes: Buffer.from(part.inlineData.data as string, 'base64'),
        mimeType: part.inlineData.mimeType ?? 'image/png',
        costEstimate: 0.1,
      };
    },
  };
}
