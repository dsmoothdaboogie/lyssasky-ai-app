import { describe, it, expect } from 'vitest';
import { db } from '../admin';
import { allocatePerkCode } from './perkCode';

describe('allocatePerkCode', () => {
  it('returns a code not used by any lead', async () => {
    const code = await allocatePerkCode();
    expect(code).toMatch(/^ROOM-[A-Z2-9]{4}$/);
    const clash = await db.collection('leads').where('perk.code', '==', code).get();
    expect(clash.empty).toBe(true);
  });

  it('retries on collision', async () => {
    await db.collection('leads').doc('perk-clash').set({ perk: { code: 'ROOM-AAAA' } });
    // First draw → AAAA (taken), second draw → BBBB.
    const draws = [0, 0, 0, 0, 1 / 32, 1 / 32, 1 / 32, 1 / 32];
    let i = 0;
    const code = await allocatePerkCode(() => draws[i++] ?? 0.5);
    expect(code).toBe('ROOM-BBBB');
  });
});
