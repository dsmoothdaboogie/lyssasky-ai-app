import type { PaymentProvider } from './provider';
export function createMockPaymentProvider(appBaseUrl: string): PaymentProvider {
  return {
    async createCheckoutSession({ leadId }) {
      const sessionId = `mock_${leadId}`;
      const url = new URL('/mock-checkout', appBaseUrl);
      url.searchParams.set('lead', leadId);
      url.searchParams.set('session', sessionId);
      return { sessionId, checkoutUrl: url.toString() };
    },
  };
}
