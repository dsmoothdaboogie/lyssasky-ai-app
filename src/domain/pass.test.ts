import { describe, it, expect } from 'vitest';
import {
  DAY_MS, IN_FLIGHT_STALE_MS, PERK_CODE_ALPHABET,
  restylesLeft, isPassExpired, isRestyleInFlight, canRestyle, isPerkValid,
  generatePerkCode, buildPassFields,
} from './pass';
import type { LeadPass } from './types';

const pass = (p: Partial<LeadPass> = {}): { pass: LeadPass } => ({
  pass: { restylesTotal: 5, restylesUsed: 0, expiresAt: 1_000_000, ...p },
});

describe('restylesLeft', () => {
  it('is total minus used', () => expect(restylesLeft(pass({ restylesUsed: 2 }))).toBe(3));
  it('never goes negative', () => expect(restylesLeft(pass({ restylesUsed: 9 }))).toBe(0));
  it('is 0 with no pass (legacy lead)', () => expect(restylesLeft({})).toBe(0));
});

describe('isPassExpired', () => {
  it('is false before expiresAt', () => expect(isPassExpired(pass(), 999_999)).toBe(false));
  it('is true exactly at expiresAt', () => expect(isPassExpired(pass(), 1_000_000)).toBe(true));
  it('is true with no pass', () => expect(isPassExpired({}, 0)).toBe(true));
});

describe('isRestyleInFlight', () => {
  it('is true for a fresh marker', () =>
    expect(isRestyleInFlight(pass({ inFlight: 500 }), 500 + IN_FLIGHT_STALE_MS - 1)).toBe(true));
  it('is false once the marker is stale', () =>
    expect(isRestyleInFlight(pass({ inFlight: 500 }), 500 + IN_FLIGHT_STALE_MS)).toBe(false));
  it('is false with no marker', () => expect(isRestyleInFlight(pass(), 0)).toBe(false));
});

describe('canRestyle', () => {
  it('allows with restyles left before expiry', () => expect(canRestyle(pass(), 0)).toBe(true));
  it('rejects when exhausted', () => expect(canRestyle(pass({ restylesUsed: 5 }), 0)).toBe(false));
  it('rejects when expired', () => expect(canRestyle(pass(), 1_000_000)).toBe(false));
  it('rejects with no pass', () => expect(canRestyle({}, 0)).toBe(false));
});

describe('isPerkValid', () => {
  const perk = { code: 'ROOM-ABCD', discountPct: 10, validUntil: 2_000 };
  it('is valid before validUntil', () => expect(isPerkValid({ perk }, 1_999)).toBe(true));
  it('is invalid at validUntil', () => expect(isPerkValid({ perk }, 2_000)).toBe(false));
  it('is invalid once redeemed', () => expect(isPerkValid({ perk: { ...perk, redeemedAt: 1 } }, 0)).toBe(false));
  it('is invalid with no perk', () => expect(isPerkValid({}, 0)).toBe(false));
});

describe('generatePerkCode', () => {
  it('has the ROOM- prefix and 4 unambiguous chars', () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePerkCode();
      expect(code).toMatch(/^ROOM-[A-Z2-9]{4}$/);
      for (const ch of code.slice(5)) expect(PERK_CODE_ALPHABET).toContain(ch);
    }
  });
  it('never uses O, 0, I or 1', () => {
    expect(PERK_CODE_ALPHABET).not.toMatch(/[O0I1]/);
  });
  it('is deterministic given rand', () => {
    expect(generatePerkCode(() => 0)).toBe('ROOM-AAAA');
  });
});

describe('buildPassFields', () => {
  it('snapshots config onto pass and perk', () => {
    const out = buildPassFields(1_000, { passRestyles: 5, passDays: 7, perkDiscountPct: 10, perkDays: 30 }, 'ROOM-WXYZ');
    expect(out.pass).toEqual({ restylesTotal: 5, restylesUsed: 0, expiresAt: 1_000 + 7 * DAY_MS });
    expect(out.perk).toEqual({ code: 'ROOM-WXYZ', discountPct: 10, validUntil: 1_000 + 30 * DAY_MS });
    expect(out.looks).toEqual([]);
  });
});
