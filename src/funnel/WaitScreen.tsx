import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FunnelLayout } from './FunnelLayout';
import { Button } from '../components/Button';
import { useFunnelState } from './useFunnelState';
import { watchLead, apiRegenerate } from '../firebase/api';
import { ensureAnonymousAuth } from '../firebase/client';
import type { Lead } from '../domain/types';

const GENERIC_ERROR = "Something went wrong on our end — please try again in a moment.";

type ViewState = 'waiting' | 'failed';

/**
 * Reached either via router navigation from checkout (in-memory funnel
 * state intact) or after the mock-checkout full-page reload (in-memory
 * state wiped) — so `leadId` is resolved from `useFunnelState()` first,
 * falling back to the `lead` query param.
 *
 * Subscribes to the lead doc in realtime via `watchLead` and reveals the
 * result the moment generation finishes, without polling. The Firebase
 * anonymous-auth session survives the reload but is restored asynchronously,
 * so auth must be confirmed with `ensureAnonymousAuth()` before the
 * `onSnapshot` subscription is opened — otherwise the read can be denied by
 * security rules for a brief window after reload.
 */
export function WaitScreen() {
  const [searchParams] = useSearchParams();
  const { leadId: stateLeadId, setLeadId } = useFunnelState();
  const navigate = useNavigate();

  const leadId = stateLeadId ?? searchParams.get('lead');

  const [view, setView] = useState<ViewState>('waiting');
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!leadId) return undefined;

    let unsub: (() => void) | undefined;
    let cancelled = false;

    const handleLead = (lead: Lead | undefined) => {
      if (!mountedRef.current || cancelled) return;
      if (lead?.status === 'generated') {
        setLeadId(leadId);
        navigate(`/result?lead=${leadId}`);
      } else if (lead?.status === 'failed') {
        setView('failed');
      } else {
        setView('waiting');
      }
    };

    (async () => {
      await ensureAnonymousAuth();
      if (cancelled) return;
      unsub = watchLead(leadId, handleLead);
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [leadId, navigate, setLeadId]);

  if (!leadId) {
    return (
      <FunnelLayout>
        <section>
          <h1>Let's start over</h1>
          <p>We couldn't find your design in progress. No worries — let's start fresh.</p>
          <Link to="/" className="btn btn-primary">
            Start over
          </Link>
        </section>
      </FunnelLayout>
    );
  }

  const handleRetry = async () => {
    setError(null);
    setIsRetrying(true);
    try {
      await apiRegenerate(leadId);
      if (!mountedRef.current) return;
      setView('waiting');
    } catch {
      if (!mountedRef.current) return;
      setError(GENERIC_ERROR);
    } finally {
      if (mountedRef.current) setIsRetrying(false);
    }
  };

  if (view === 'failed') {
    return (
      <FunnelLayout>
        <section>
          <h1>We hit a snag</h1>
          <p>
            Something didn't go quite right, but don't worry — we'll email your finished
            design shortly. Or, if you'd rather not wait for that, you can try again right
            now.
          </p>
          {error && (
            <p role="alert" style={{ marginTop: 'var(--space-3)' }}>
              {error}
            </p>
          )}
          <Button
            onClick={handleRetry}
            disabled={isRetrying}
            style={{ marginTop: 'var(--space-4)', width: '100%' }}
          >
            {isRetrying ? 'Just a moment…' : 'Try again'}
          </Button>
        </section>
      </FunnelLayout>
    );
  }

  return (
    <FunnelLayout>
      <section style={{ textAlign: 'center' }}>
        <div className="wait-animation" aria-hidden="true">
          <span className="wait-pulse" />
          <span className="wait-pulse wait-pulse-delay" />
        </div>
        <h1>Marjorie's assistant is styling your room…</h1>
        <p role="status" className="text-muted">
          This takes about 20–30 seconds. Sit tight — we'll bring you straight to your new
          room the moment it's ready.
        </p>
      </section>
    </FunnelLayout>
  );
}
