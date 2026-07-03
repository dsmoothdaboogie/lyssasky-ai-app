import { describe, it, expect } from 'vitest';
import { createMockPaymentProvider } from './mockProvider';

describe('mock payment provider', () => {
  it('returns a mock-checkout URL scoped to the lead', async () => {
    const p = createMockPaymentProvider('http://localhost:5173');
    const s = await p.createCheckoutSession({ leadId: 'lead123', amountCents: 500, currency: 'CAD' });
    expect(s.sessionId).toBe('mock_lead123');
    expect(s.checkoutUrl).toContain('/mock-checkout');
    expect(s.checkoutUrl).toContain('lead=lead123');
    expect(s.checkoutUrl).toContain('session=mock_lead123');
  });
});
