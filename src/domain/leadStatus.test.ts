import { describe, it, expect } from 'vitest';
import { canTransition, assertTransition } from './leadStatus';

describe('lead status machine', () => {
  it('allows the happy path', () => {
    expect(canTransition('captured', 'paid')).toBe(true);
    expect(canTransition('paid', 'generated')).toBe(true);
    expect(canTransition('generated', 'rated')).toBe(true);
    expect(canTransition('rated', 'booked')).toBe(true);
  });
  it('allows booking directly from generated (customer skips rating)', () => {
    expect(canTransition('generated', 'booked')).toBe(true);
  });
  it('allows re-generation and failure/retry paths', () => {
    expect(canTransition('generated', 'generated')).toBe(true); // free re-generate
    expect(canTransition('paid', 'failed')).toBe(true);
    expect(canTransition('failed', 'generated')).toBe(true);    // admin re-run
  });
  it('rejects skipping payment', () => {
    expect(canTransition('captured', 'generated')).toBe(false);
  });
  it('assertTransition throws on illegal moves', () => {
    expect(() => assertTransition('booked', 'captured')).toThrow(/illegal lead transition/i);
  });
});
