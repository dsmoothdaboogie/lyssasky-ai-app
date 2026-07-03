/**
 * Tiny wrapper around a full-page navigation. Kept as its own module so
 * tests can mock it — a real `window.location.assign` isn't observable
 * (or safe to trigger) in jsdom. Used for handoffs to URLs outside the
 * SPA's router: the mock checkout page today, the real Stripe Checkout
 * URL in Phase 3.
 */
export function redirectTo(url: string): void {
  window.location.assign(url);
}
