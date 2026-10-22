import { describe, it, expect } from 'vitest';
import { formatPrice } from './price';

describe('formatPrice', () => {
  it('drops decimals for whole-dollar amounts', () => {
    expect(formatPrice(500)).toBe('$5');
    expect(formatPrice(900)).toBe('$9');
  });
  it('keeps two decimals otherwise', () => {
    expect(formatPrice(750)).toBe('$7.50');
    expect(formatPrice(499)).toBe('$4.99');
  });
});
