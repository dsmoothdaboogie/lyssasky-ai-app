import { describe, it, expect } from 'vitest';
import { storage } from '../admin';
import { generateImage, PROVIDER_ATTEMPT_TIMEOUT_MS } from './generateImage';
import { createMockGenerationProvider } from './mockProvider';
import type { GenerationProvider } from './provider';

async function seedInputPhoto(path: string) {
  await storage.bucket().file(path).save(Buffer.from('fakejpeg'), { contentType: 'image/jpeg' });
}

describe('generateImage', () => {
  it('downloads the input, calls the provider, and saves the output under outputDir', async () => {
    await seedInputPhoto('testbench/in.jpg');
    const result = await generateImage({
      inputPhotoPath: 'testbench/in.jpg',
      prompt: 'restyle',
      provider: createMockGenerationProvider(),
      outputDir: 'testbench/results',
    });
    expect(result.outputPhotoPath).toMatch(/^testbench\/results\//);
    expect(result.mimeType).toBe('image/png');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.costEstimate).toBe(0);

    const [exists] = await storage.bucket().file(result.outputPhotoPath).exists();
    expect(exists).toBe(true);
  });

  it('defaults outputDir to testbench/results when not provided', async () => {
    await seedInputPhoto('testbench/in2.jpg');
    const result = await generateImage({
      inputPhotoPath: 'testbench/in2.jpg',
      prompt: 'restyle',
      provider: createMockGenerationProvider(),
    });
    expect(result.outputPhotoPath).toMatch(/^testbench\/results\//);
  });

  it('defaults the per-attempt timeout so two attempts fit inside the 120s function limit', () => {
    expect(PROVIDER_ATTEMPT_TIMEOUT_MS).toBe(50_000);
  });

  it('rejects with a timeout error when the provider never resolves', async () => {
    await seedInputPhoto('testbench/in-hang.jpg');
    const hanging: GenerationProvider = { generate: () => new Promise(() => {}) };
    await expect(generateImage({
      inputPhotoPath: 'testbench/in-hang.jpg', prompt: 'restyle', provider: hanging, attemptTimeoutMs: 20,
    })).rejects.toThrow(/timed out/i);
  });

  it('retries once then throws if the provider keeps failing', async () => {
    await seedInputPhoto('testbench/in3.jpg');
    let callCount = 0;
    const alwaysFailingProvider: GenerationProvider = {
      async generate() {
        callCount++;
        throw new Error('provider exploded');
      },
    };
    await expect(
      generateImage({
        inputPhotoPath: 'testbench/in3.jpg',
        prompt: 'restyle',
        provider: alwaysFailingProvider,
        outputDir: 'testbench/results',
      })
    ).rejects.toThrow('provider exploded');
    expect(callCount).toBe(2);
  });
});
