import { db, storage } from '../admin';
import { DAY_MS } from '../../../src/domain/pass';
import { PLACEHOLDER_PNG_BASE64 } from '../generation/placeholder';
import type { Lead, Look } from '../../../src/domain/types';

const OWNER = 'seed-owner';
const MOODS = ['warm_cozy', 'light_airy', 'bold_dramatic', 'neutral_calm'];
const STYLES = ['scandi', 'japandi', 'mid_century', 'modern_farmhouse', 'boho', 'coastal'];

interface Spec { id: string; used: number; expiresIn: number; status: Lead['status']; redeemed?: boolean; booked?: boolean }

const SPECS: Spec[] = [
  { id: 'sample-fresh', used: 0, expiresIn: 7 * DAY_MS, status: 'generated' },
  { id: 'sample-partial', used: 2, expiresIn: 4 * DAY_MS, status: 'rated' },
  { id: 'sample-exhausted', used: 5, expiresIn: 2 * DAY_MS, status: 'rated' },
  { id: 'sample-expired', used: 1, expiresIn: -DAY_MS, status: 'generated' },
  { id: 'sample-booked-redeemed', used: 3, expiresIn: 3 * DAY_MS, status: 'booked', redeemed: true, booked: true },
];

/** Emulator-only sample data so the admin and result pages can be eyeballed in every pass state. */
export async function seedSampleLeads(now: number): Promise<string[]> {
  const png = Buffer.from(PLACEHOLDER_PNG_BASE64, 'base64');
  const bucket = storage.bucket();
  for (const [i, spec] of SPECS.entries()) {
    const originalPhotoPath = `leads/${OWNER}/${spec.id}/original.png`;
    await bucket.file(originalPhotoPath).save(png, { contentType: 'image/png' });
    const looks: Look[] = [];
    for (let n = 0; n <= spec.used; n++) {
      const imagePath = `leads/${OWNER}/generated/${spec.id}-${n}.png`;
      await bucket.file(imagePath).save(png, { contentType: 'image/png' });
      looks.push({ imagePath, styleSlug: STYLES[n % STYLES.length], colorMood: MOODS[n % MOODS.length], createdAt: now - (spec.used - n) * 60_000 });
    }
    const paidAt = now + spec.expiresIn - 7 * DAY_MS;
    const lead: Lead = {
      id: spec.id, ownerUid: OWNER, leadToken: `token-${spec.id}`, email: `${spec.id}@example.com`,
      status: spec.status,
      answers: { roomType: 'living_room', styleSlug: looks[0].styleSlug, colorMood: looks[0].colorMood, budget: '1k_5k', timeline: 'within_3_months' },
      originalPhotoPath,
      generatedImagePaths: looks.map((l) => l.imagePath),
      looks,
      paymentId: `mock_${spec.id}`,
      pass: { restylesTotal: 5, restylesUsed: spec.used, expiresAt: now + spec.expiresIn },
      perk: {
        code: `ROOM-SMP${'ABCDE'[i]}`, discountPct: 10, validUntil: paidAt + 30 * DAY_MS,
        ...(spec.redeemed ? { redeemedAt: now - DAY_MS } : {}),
      },
      ...(spec.booked ? { booking: { name: 'Sample Customer', interest: 'virtual_styling' as const }, bookingNotifiedAt: now } : {}),
      ...(spec.status !== 'generated' ? { rating: 4, feedback: 'Love it, maybe warmer lighting' } : {}),
      costEstimateTotal: 0,
      timestamps: { captured: paidAt - 60_000, paid: paidAt, generated: paidAt + 30_000 },
      createdAt: paidAt - 60_000, updatedAt: now,
    };
    await db.collection('leads').doc(spec.id).set(lead);
  }
  return SPECS.map((s) => s.id);
}
