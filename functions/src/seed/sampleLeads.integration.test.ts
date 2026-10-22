import { describe, it, expect } from 'vitest';
import { db, storage } from '../admin';
import { seedSampleLeads } from './sampleLeads';
import { canRestyle, isPassExpired, restylesLeft } from '../../../src/domain/pass';
import type { Lead } from '../../../src/domain/types';

describe('seedSampleLeads', () => {
  it('creates one lead per pass state with real image files', async () => {
    const now = Date.now();
    const ids = await seedSampleLeads(now);
    expect(ids).toEqual(['sample-fresh', 'sample-partial', 'sample-exhausted', 'sample-expired', 'sample-booked-redeemed']);
    const get = async (id: string) => (await db.collection('leads').doc(id).get()).data() as Lead;
    expect(restylesLeft(await get('sample-fresh'))).toBe(5);
    expect(restylesLeft(await get('sample-partial'))).toBe(3);
    expect(canRestyle(await get('sample-exhausted'), now)).toBe(false);
    expect(isPassExpired(await get('sample-expired'), now)).toBe(true);
    const booked = await get('sample-booked-redeemed');
    expect(booked.status).toBe('booked');
    expect(booked.perk!.redeemedAt).toBeDefined();
    for (const id of ids) {
      const lead = await get(id);
      expect(lead.looks!.length).toBe(lead.generatedImagePaths.length);
      const [exists] = await storage.bucket().file(lead.generatedImagePaths[0]).exists();
      expect(exists).toBe(true);
    }
  });
});
