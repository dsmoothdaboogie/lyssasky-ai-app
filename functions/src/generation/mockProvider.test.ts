import { describe, it, expect } from 'vitest';
import { createMockGenerationProvider } from './mockProvider';

describe('mock generation provider', () => {
  it('returns non-empty PNG bytes at zero cost', async () => {
    const p = createMockGenerationProvider();
    const out = await p.generate({ photoBytes: Buffer.from('x'), mimeType: 'image/jpeg', prompt: 'restyle' });
    expect(out.mimeType).toBe('image/png');
    expect(out.imageBytes.length).toBeGreaterThan(0);
    expect(out.costEstimate).toBe(0);
  });
});
