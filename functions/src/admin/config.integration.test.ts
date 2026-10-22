import { describe, it, expect } from 'vitest';
import { db } from '../admin';
import { DEFAULT_CONFIG } from '../../../src/config/defaultConfig';
import { adminUpdateConfigDoc, validateConfigPatch } from './config';

describe('admin config', () => {
  it('merges a patch into config/app, preserving untouched fields', async () => {
    await adminUpdateConfigDoc(validateConfigPatch({ priceCents: 700, generationMode: 'gemini' }));
    const snap = await db.collection('config').doc('app').get();
    const data = snap.data()!;
    expect(data.priceCents).toBe(700);
    expect(data.generationMode).toBe('gemini');
    expect(data.currency).toBe(DEFAULT_CONFIG.currency);
    expect(data.questionnaire).toEqual(DEFAULT_CONFIG.questionnaire);
  });

  it('rejects an invalid paymentMode', () => {
    expect(() => validateConfigPatch({ paymentMode: 'paypal' })).toThrow(/paymentMode/i);
  });

  it('rejects a negative priceCents', () => {
    expect(() => validateConfigPatch({ priceCents: -1 })).toThrow(/priceCents/i);
  });

  it('drops unknown fields from the patch', () => {
    const result = validateConfigPatch({ priceCents: 700, bogusField: 1 });
    expect(result).toEqual({ priceCents: 700 });
  });

  it('rejects an empty notifyEmail', () => {
    expect(() => validateConfigPatch({ notifyEmail: '' })).toThrow(/notifyEmail/i);
  });

  it('rejects a notifyEmail that is not an email address', () => {
    expect(() => validateConfigPatch({ notifyEmail: 'not-an-email' })).toThrow(/notifyEmail/i);
  });

  it('accepts and trims a valid notifyEmail', () => {
    expect(validateConfigPatch({ notifyEmail: '  hi@lyssasky.com  ' })).toEqual({
      notifyEmail: 'hi@lyssasky.com',
    });
  });
});

describe('validateConfigPatch — Room Pass fields', () => {
  it('accepts valid pass settings', () => {
    expect(validateConfigPatch({ passRestyles: 5, passDays: 7, perkDiscountPct: 10, perkDays: 30 }))
      .toEqual({ passRestyles: 5, passDays: 7, perkDiscountPct: 10, perkDays: 30 });
  });
  it('allows 0 restyles (preview-only pass)', () => {
    expect(validateConfigPatch({ passRestyles: 0 })).toEqual({ passRestyles: 0 });
  });
  it.each([
    [{ passRestyles: -1 }, /passRestyles/],
    [{ passRestyles: 2.5 }, /passRestyles/],
    [{ passRestyles: 51 }, /passRestyles/],
    [{ passDays: 0 }, /passDays/],
    [{ perkDays: 0 }, /perkDays/],
    [{ perkDiscountPct: 101 }, /perkDiscountPct/],
    [{ perkDiscountPct: -5 }, /perkDiscountPct/],
    [{ passDays: '7' }, /passDays/],
  ])('rejects %j', (patch, msg) => {
    expect(() => validateConfigPatch(patch)).toThrow(msg);
  });
});
