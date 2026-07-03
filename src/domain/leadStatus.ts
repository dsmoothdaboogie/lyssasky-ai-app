import type { LeadStatus } from './types';

export const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  captured: ['paid'],
  paid: ['generated', 'failed'],
  generated: ['generated', 'rated', 'booked', 'failed'],
  rated: ['booked', 'generated'],
  booked: [],
  failed: ['paid', 'generated'],
};

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return LEAD_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: LeadStatus, to: LeadStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal lead transition: ${from} -> ${to}`);
  }
}
