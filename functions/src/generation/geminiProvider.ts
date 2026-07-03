import type { GenerationProvider } from './provider';
// Uses @google/genai image editing.
//
// Verified 2026-07-03 against:
//  - context7 "Google Gen AI SDK" JS/TS docs (/websites/googleapis_github_io_js-genai)
//  - https://ai.google.dev/gemini-api/docs/generate-content/image-generation (the
//    `ai.models.generateContent` "legacy" call shape — still fully supported; "legacy"
//    here just distinguishes it from the newer `ai.interactions.create` surface, it is
//    NOT deprecated/removed)
//
// Confirmed still correct, unchanged from the first pass:
//  - Request shape: `ai.models.generateContent({ model, contents })` where `contents`
//    is an array mixing `{ inlineData: { data: base64, mimeType } }` (input image) and
//    `{ text: prompt }` parts. Field names are camelCase (`inlineData`, `mimeType`) for
//    this API surface (the newer Interactions API uses snake_case `mime_type` instead —
//    do not mix the two).
//  - Response shape: generated image comes back at
//    `res.candidates[0].content.parts[].inlineData.data` (base64) with a sibling
//    `inlineData.mimeType`.
//
// Changed: model id bumped from `gemini-2.5-flash-image` to `gemini-3.1-flash-image`.
// As of the verification date, Google's own current docs example for this exact
// generateContent + inlineData shape uses `gemini-3.1-flash-image`, and separately
// list `gemini-2.5-flash-image` as the "legacy" image model (still usable, but no
// longer the recommended default). There is also a Pro tier (`gemini-3-pro-image-preview`)
// still in preview, and a Lite tier (`gemini-3.1-flash-lite-image`) for cheaper/faster
// generation — either could be swapped in here later without any shape changes.
//
// IMPORTANT — this could not be exercised against a live key in this environment.
// Before going live: run one real funnel generation (see functions/.env.example) and
// double-check the model id above is still current — Google revises image model ids
// periodically. If `gemini-3.1-flash-image` 404s, try `gemini-2.5-flash-image` (older,
// known-stable) as a fallback while re-checking https://ai.google.dev/gemini-api/docs/image-generation.
export function createGeminiGenerationProvider(apiKey: string): GenerationProvider {
  return {
    async generate({ photoBytes, mimeType, prompt }) {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image',
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
