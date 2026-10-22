import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';
import { assertOwner } from './guards';
import { loadConfig } from './config';
import { generateLook } from './generation/runGeneration';
import { isPassExpired, isRestyleInFlight, restylesLeft } from '../../src/domain/pass';
import type { GenerationProvider } from './generation/provider';
import type { Lead, Look, Style } from '../../src/domain/types';

async function assertValidChoice(styleSlug: unknown, colorMood: unknown): Promise<void> {
  const style = typeof styleSlug === 'string' && styleSlug
    ? ((await db.collection('styles').doc(styleSlug).get()).data() as Style | undefined)
    : undefined;
  if (!style || !style.active) throw new HttpsError('invalid-argument', "That style isn't available");
  const config = await loadConfig();
  const moods = config.questionnaire.find((q) => q.id === 'colorMood')?.options ?? [];
  if (typeof colorMood !== 'string' || !moods.some((o) => o.value === colorMood)) {
    throw new HttpsError('invalid-argument', "That color mood isn't available");
  }
}

/**
 * Reserves one restyle atomically. Returns the live lead snapshot it reserved against.
 *
 * Uses a read + precondition-guarded update (lastUpdateTime) rather than
 * runTransaction: the Firestore emulator resolves two concurrent read-then-write
 * transactions on one document by deadlock timeout (~3s), so the loser would only
 * retry after the winner had already finished and cleared inFlight. A precondition
 * failure is immediate, and the retry then sees the winner's inFlight marker.
 */
async function reserveRestyle(leadId: string, uid: string, isAdmin: boolean): Promise<Lead> {
  const ref = db.collection('leads').doc(leadId);
  for (let attempt = 0; attempt < 5; attempt++) {
    const snap = await ref.get();
    const lead = snap.data() as Lead | undefined;
    if (!lead) throw new HttpsError('not-found', 'Lead not found');
    if (!isAdmin) assertOwner(uid, lead);
    const now = Date.now();
    if (!lead.pass || isPassExpired(lead, now)) {
      throw new HttpsError('failed-precondition', 'Your Room Pass has ended');
    }
    if (lead.generatedImagePaths.length === 0) {
      throw new HttpsError('failed-precondition', 'Your first look is still on its way');
    }
    if (isRestyleInFlight(lead, now)) {
      throw new HttpsError('aborted', 'A look is already being generated');
    }
    if (restylesLeft(lead) <= 0) {
      throw new HttpsError('resource-exhausted', "You've used all your restyles");
    }
    try {
      await ref.update(
        { 'pass.restylesUsed': lead.pass.restylesUsed + 1, 'pass.inFlight': now, updatedAt: now },
        { lastUpdateTime: snap.updateTime! },
      );
      return lead;
    } catch (err) {
      // Someone else wrote the lead since we read it: re-read and re-evaluate.
      if ((err as { code?: number }).code !== 9) throw err; // 9 = FAILED_PRECONDITION
    }
  }
  throw new HttpsError('aborted', 'A look is already being generated');
}

export async function restyleDoc(
  leadId: string,
  uid: string,
  input: { styleSlug: string; colorMood: string },
  opts?: { isAdmin?: boolean; provider?: GenerationProvider; attemptTimeoutMs?: number },
): Promise<{ imagePath: string; restylesLeft: number }> {
  await assertValidChoice(input?.styleSlug, input?.colorMood);
  const lead = await reserveRestyle(leadId, uid, opts?.isAdmin === true);
  const ref = db.collection('leads').doc(leadId);
  const answers = { ...lead.answers!, styleSlug: input.styleSlug, colorMood: input.colorMood };

  let result;
  try {
    result = await generateLook(leadId, lead, answers, opts?.provider, opts?.attemptTimeoutMs);
  } catch {
    // Refund inside a transaction so a concurrent read never sees a
    // half-refunded pass. Status is deliberately left alone: only a failed
    // FIRST preview moves a lead to 'failed'.
    await db.runTransaction(async (tx) => {
      const live = (await tx.get(ref)).data() as Lead;
      tx.update(ref, {
        'pass.restylesUsed': Math.max(0, live.pass!.restylesUsed - 1),
        'pass.inFlight': FieldValue.delete(),
        updatedAt: Date.now(),
      });
    });
    throw new HttpsError('internal', "We couldn't create that look — your restyle wasn't used. Please try again.");
  }

  const now = Date.now();
  const look: Look = { imagePath: result.outputPhotoPath, styleSlug: input.styleSlug, colorMood: input.colorMood, createdAt: now };
  const updated = await db.runTransaction(async (tx) => {
    const live = (await tx.get(ref)).data() as Lead;
    const next = {
      generatedImagePaths: [...live.generatedImagePaths, result.outputPhotoPath],
      looks: [...(live.looks ?? []), look],
      costEstimateTotal: live.costEstimateTotal + result.costEstimate,
      'pass.inFlight': FieldValue.delete(),
      updatedAt: now,
    };
    tx.update(ref, next);
    return live;
  });
  return { imagePath: result.outputPhotoPath, restylesLeft: restylesLeft(updated) };
}

export const restyle = onCall({ timeoutSeconds: 120 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign-in required');
  const { leadId, styleSlug, colorMood } = (req.data ?? {}) as Record<string, unknown>;
  if (typeof leadId !== 'string' || !leadId) throw new HttpsError('invalid-argument', 'leadId is required');
  return restyleDoc(leadId, req.auth.uid, { styleSlug: styleSlug as string, colorMood: colorMood as string }, {
    isAdmin: req.auth.token?.admin === true,
  });
});
