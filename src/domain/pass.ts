import type { AppConfig, BookingInterest, Lead, LeadPass, LeadPerk, Look } from './types';

export const BOOKING_INTERESTS: readonly BookingInterest[] = ['chat', 'virtual_styling', 'room_refresh'];
export const INTEREST_LABELS: Record<BookingInterest, string> = {
  chat: 'Free 15-min chat',
  virtual_styling: 'Virtual Styling (from $250/room)',
  room_refresh: 'Room Refresh (from $650/room, local)',
};

export const DAY_MS = 24 * 60 * 60 * 1000;
/** A restyle marker older than this is treated as abandoned (crashed function). */
export const IN_FLIGHT_STALE_MS = 3 * 60 * 1000;
/** No O/0/I/1 so codes read unambiguously over the phone or in an email. */
export const PERK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function restylesLeft(lead: Pick<Lead, 'pass'>): number {
  if (!lead.pass) return 0;
  return Math.max(0, lead.pass.restylesTotal - lead.pass.restylesUsed);
}

export function isPassExpired(lead: Pick<Lead, 'pass'>, now: number): boolean {
  if (!lead.pass) return true;
  return now >= lead.pass.expiresAt;
}

export function isRestyleInFlight(lead: Pick<Lead, 'pass'>, now: number): boolean {
  const started = lead.pass?.inFlight;
  return started !== undefined && now - started < IN_FLIGHT_STALE_MS;
}

export function canRestyle(lead: Pick<Lead, 'pass'>, now: number): boolean {
  return !isPassExpired(lead, now) && restylesLeft(lead) > 0;
}

export function isPerkValid(lead: Pick<Lead, 'perk'>, now: number): boolean {
  if (!lead.perk || lead.perk.redeemedAt !== undefined) return false;
  return now < lead.perk.validUntil;
}

export function generatePerkCode(rand: () => number = Math.random): string {
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += PERK_CODE_ALPHABET[Math.floor(rand() * PERK_CODE_ALPHABET.length)];
  }
  return `ROOM-${suffix}`;
}

export function buildPassFields(
  paidAt: number,
  cfg: Pick<AppConfig, 'passRestyles' | 'passDays' | 'perkDiscountPct' | 'perkDays'>,
  code: string,
): { pass: LeadPass; perk: LeadPerk; looks: Look[] } {
  return {
    pass: { restylesTotal: cfg.passRestyles, restylesUsed: 0, expiresAt: paidAt + cfg.passDays * DAY_MS },
    perk: { code, discountPct: cfg.perkDiscountPct, validUntil: paidAt + cfg.perkDays * DAY_MS },
    looks: [],
  };
}
