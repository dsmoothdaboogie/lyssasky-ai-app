import type { GenerationProvider } from './provider';
import { PLACEHOLDER_PNG_BASE64 } from './placeholder';
export function createMockGenerationProvider(): GenerationProvider {
  return {
    async generate() {
      return {
        imageBytes: Buffer.from(PLACEHOLDER_PNG_BASE64, 'base64'),
        mimeType: 'image/png',
        costEstimate: 0,
      };
    },
  };
}
