import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FunnelLayout } from './FunnelLayout';
import { Button } from '../components/Button';
import { useFunnelState } from './useFunnelState';
import { apiConfirmPaymentMock } from '../firebase/api';

const GENERIC_ERROR = "Something went wrong on our end — please try again in a moment.";

/**
 * Stand-in for Stripe Checkout while Phase 1 runs in mock payment mode.
 * Reached via a full-page redirect from the email step
 * (`window.location.assign`), which reloads the app and wipes in-memory
 * funnel state — so `lead` and `session` are read from the query string,
 * not from `useFunnelState()`. The Firebase anonymous-auth session
 * survives the reload, so the customer can still act on their own lead.
 *
 * "Simulate success" calls the exact same `confirmPaymentMock` cloud
 * function the real Stripe webhook will call in Phase 3, so this
 * exercises the identical server-side payment-confirmed path.
 */
export function MockCheckoutPage() {
  const [searchParams] = useSearchParams();
  const { setLeadId } = useFunnelState();
  const navigate = useNavigate();
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lead = searchParams.get('lead');
  const session = searchParams.get('session');

  if (!lead || !session) {
    return (
      <FunnelLayout>
        <section>
          <h1>Something went wrong</h1>
          <p>
            We couldn't find your checkout session. No worries — let's start
            fresh.
          </p>
          <Link to="/" className="btn btn-primary">
            Start over
          </Link>
        </section>
      </FunnelLayout>
    );
  }

  const handleSuccess = async () => {
    setError(null);
    setIsConfirming(true);
    try {
      await apiConfirmPaymentMock(lead, session);
      setLeadId(lead);
      navigate(`/wait?lead=${lead}`);
    } catch {
      setError(GENERIC_ERROR);
      setIsConfirming(false);
    }
  };

  const handleCancel = () => {
    navigate('/email');
  };

  return (
    <FunnelLayout step={4} totalSteps={5}>
      <section>
        <h1>Almost there</h1>
        <p className="text-muted" style={{ fontSize: '0.9rem' }}>
          This is a mock/test checkout — it stands in for our real payment
          provider while we're in preview mode. No card is ever charged here.
        </p>

        <div className="card" style={{ padding: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          <p style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>Room restyle preview</p>
          <p style={{ fontSize: '1.5rem', margin: 0 }}>$5 CAD</p>
          <p className="text-muted" style={{ marginTop: 'var(--space-2)' }}>
            A first look at what your room could feel like.
          </p>
        </div>

        {error && (
          <p role="alert" style={{ marginTop: 'var(--space-3)' }}>
            {error}
          </p>
        )}

        {isConfirming && (
          <p role="status" className="text-muted" style={{ marginTop: 'var(--space-3)' }}>
            Confirming your payment…
          </p>
        )}

        <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
          <Button onClick={handleSuccess} disabled={isConfirming} style={{ width: '100%' }}>
            {isConfirming ? 'Just a moment…' : 'Simulate success'}
          </Button>
          <Button
            variant="secondary"
            onClick={handleCancel}
            disabled={isConfirming}
            style={{ width: '100%' }}
          >
            Simulate cancel
          </Button>
        </div>
        <p className="text-muted" style={{ marginTop: 'var(--space-3)', fontSize: '0.85rem' }}>
          No worries if you're not ready — you can come back and pick up right
          where you left off.
        </p>
      </section>
    </FunnelLayout>
  );
}
