import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../admin';
import { assertAdmin } from '../guards';
import { DEFAULT_CONFIG } from '../../../src/config/defaultConfig';
import type { AppConfig, QuestionDef, QuestionOption } from '../../../src/domain/types';

const QUESTION_TYPES = new Set(['single', 'gallery', 'text']);
const PAYMENT_MODES = new Set(['mock', 'stripe']);
const GENERATION_MODES = new Set(['mock', 'gemini']);

function str(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new HttpsError('invalid-argument', `Invalid ${field}`);
  return v;
}

function validateOption(v: unknown, field: string): QuestionOption {
  if (typeof v !== 'object' || v === null) throw new HttpsError('invalid-argument', `Invalid ${field}`);
  const o = v as Record<string, unknown>;
  return { value: str(o.value, `${field}.value`), label: str(o.label, `${field}.label`) };
}

function validateQuestionDef(v: unknown, index: number): QuestionDef {
  if (typeof v !== 'object' || v === null) {
    throw new HttpsError('invalid-argument', `Invalid questionnaire[${index}]`);
  }
  const q = v as Record<string, unknown>;
  const id = q.id;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new HttpsError('invalid-argument', `Invalid questionnaire[${index}].id`);
  }
  const prompt = q.prompt;
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw new HttpsError('invalid-argument', `Invalid questionnaire[${index}].prompt`);
  }
  const type = q.type;
  if (typeof type !== 'string' || !QUESTION_TYPES.has(type)) {
    throw new HttpsError('invalid-argument', `Invalid questionnaire[${index}].type`);
  }
  if (typeof q.required !== 'boolean') {
    throw new HttpsError('invalid-argument', `Invalid questionnaire[${index}].required`);
  }
  const def: QuestionDef = {
    id: id as QuestionDef['id'],
    prompt,
    type: type as QuestionDef['type'],
    required: q.required,
  };
  if (q.options !== undefined) {
    if (!Array.isArray(q.options)) {
      throw new HttpsError('invalid-argument', `Invalid questionnaire[${index}].options`);
    }
    def.options = q.options.map((o, i) => validateOption(o, `questionnaire[${index}].options[${i}]`));
  }
  return def;
}

function validateFeatureFlags(v: unknown): Record<string, boolean> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new HttpsError('invalid-argument', 'Invalid featureFlags');
  }
  const out: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val !== 'boolean') {
      throw new HttpsError('invalid-argument', `Invalid featureFlags.${key}`);
    }
    out[key] = val;
  }
  return out;
}

function intInRange(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new HttpsError('invalid-argument', `Invalid ${field}: must be an integer from ${min} to ${max}`);
  }
  return v;
}

export function validateConfigPatch(patch: unknown): Partial<AppConfig> {
  if (typeof patch !== 'object' || patch === null) {
    throw new HttpsError('invalid-argument', 'Missing patch');
  }
  const p = patch as Record<string, unknown>;
  const out: Partial<AppConfig> = {};

  if ('priceCents' in p) {
    const v = p.priceCents;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      throw new HttpsError('invalid-argument', 'Invalid priceCents: must be an integer >= 0');
    }
    out.priceCents = v;
  }
  if ('currency' in p) {
    const v = p.currency;
    if (typeof v !== 'string' || v.trim() === '') {
      throw new HttpsError('invalid-argument', 'Invalid currency: must be a non-empty string');
    }
    out.currency = v;
  }
  if ('calendlyUrl' in p) {
    out.calendlyUrl = str(p.calendlyUrl, 'calendlyUrl');
  }
  if ('notifyEmail' in p) {
    const v = p.notifyEmail;
    // This is the recipient of the booking-notification mail at go-live, so an
    // empty or malformed value would silently misroute Marjorie's briefings.
    if (typeof v !== 'string' || !/^\S+@\S+\.\S+$/.test(v.trim())) {
      throw new HttpsError('invalid-argument', 'Invalid notifyEmail: must be a non-empty email address');
    }
    out.notifyEmail = v.trim();
  }
  if ('paymentMode' in p) {
    const v = p.paymentMode;
    if (typeof v !== 'string' || !PAYMENT_MODES.has(v)) {
      throw new HttpsError('invalid-argument', "Invalid paymentMode: must be 'mock' or 'stripe'");
    }
    out.paymentMode = v as AppConfig['paymentMode'];
  }
  if ('generationMode' in p) {
    const v = p.generationMode;
    if (typeof v !== 'string' || !GENERATION_MODES.has(v)) {
      throw new HttpsError('invalid-argument', "Invalid generationMode: must be 'mock' or 'gemini'");
    }
    out.generationMode = v as AppConfig['generationMode'];
  }
  if ('featureFlags' in p) {
    out.featureFlags = validateFeatureFlags(p.featureFlags);
  }
  if ('questionnaire' in p) {
    const v = p.questionnaire;
    if (!Array.isArray(v)) {
      throw new HttpsError('invalid-argument', 'Invalid questionnaire: must be an array');
    }
    out.questionnaire = v.map((q, i) => validateQuestionDef(q, i));
  }
  if ('passRestyles' in p) out.passRestyles = intInRange(p.passRestyles, 'passRestyles', 0, 50);
  if ('passDays' in p) out.passDays = intInRange(p.passDays, 'passDays', 1, 90);
  if ('perkDiscountPct' in p) out.perkDiscountPct = intInRange(p.perkDiscountPct, 'perkDiscountPct', 0, 100);
  if ('perkDays' in p) out.perkDays = intInRange(p.perkDays, 'perkDays', 1, 365);

  return out;
}

export async function adminUpdateConfigDoc(patch: Partial<AppConfig>): Promise<void> {
  const ref = db.collection('config').doc('app');
  const snap = await ref.get();
  const current = snap.exists ? (snap.data() as AppConfig) : DEFAULT_CONFIG;
  const merged: AppConfig = { ...current, ...patch };
  await ref.set(merged);
}

export const adminUpdateConfig = onCall(async (req) => {
  assertAdmin(req.auth);
  await adminUpdateConfigDoc(validateConfigPatch(req.data?.patch));
  return { ok: true };
});
