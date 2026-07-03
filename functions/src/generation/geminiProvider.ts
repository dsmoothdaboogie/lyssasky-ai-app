import type { GenerationProvider } from './provider';
// Uses @google/genai image editing. Installed + configured in the Gemini setup task.
export function createGeminiGenerationProvider(apiKey: string): GenerationProvider {
  return {
    async generate({ photoBytes, mimeType, prompt }) {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
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
