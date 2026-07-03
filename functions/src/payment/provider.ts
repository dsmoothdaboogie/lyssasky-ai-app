export interface CheckoutSession { checkoutUrl: string; sessionId: string; }
export interface PaymentProvider {
  createCheckoutSession(input: { leadId: string; amountCents: number; currency: string }): Promise<CheckoutSession>;
}
