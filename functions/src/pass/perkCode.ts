import { db } from '../admin';
import { generatePerkCode } from '../../../src/domain/pass';

const MAX_ATTEMPTS = 10;

/**
 * Draws perk codes until one isn't used by any lead. 32^4 ≈ 1M codes, so a
 * collision is rare; the retry exists for correctness, not throughput.
 */
export async function allocatePerkCode(rand?: () => number): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generatePerkCode(rand);
    const clash = await db.collection('leads').where('perk.code', '==', code).limit(1).get();
    if (clash.empty) return code;
  }
  throw new Error('Could not allocate a unique perk code');
}
