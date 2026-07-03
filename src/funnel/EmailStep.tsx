import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { FunnelLayout } from './FunnelLayout';
import { Button } from '../components/Button';
import { useFunnelState } from './useFunnelState';
import { apiUpdateLeadAnswers, apiStartCheckout } from '../firebase/api';
import { redirectTo } from './redirect';
import type { QuestionnaireAnswers } from '../domain/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_ERROR = "Something went wrong on our end — please try again in a moment.";

/**
 * Funnel step 3: capture the customer's email before handing off to
 * checkout. Persists the (by-now-complete) questionnaire answers together
 * with the email in one call, then kicks off checkout and redirects.
 *
 * The checkout redirect is a full-page navigation, not a router push —
 * `checkoutUrl` will be a real Stripe URL (external) once Phase 3 lands,
 * so it goes through the mockable `redirectTo` helper rather than
 * `useNavigate`.
 */
export function EmailStep() {
  const { leadId, answers, setEmail } = useFunnelState();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();

    if (!EMAIL_RE.test(trimmed)) {
      setError("That doesn't look like a valid email — mind double-checking it?");
      return;
    }

    if (!leadId) {
      setError(GENERIC_ERROR);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      setEmail(trimmed);
      await apiUpdateLeadAnswers(leadId, answers as QuestionnaireAnswers, trimmed);
      const { checkoutUrl } = await apiStartCheckout(leadId);
      redirectTo(checkoutUrl);
    } catch {
      setError(GENERIC_ERROR);
      setIsSubmitting(false);
    }
  };

  return (
    <FunnelLayout step={3} totalSteps={5}>
      <section>
        <h1>Where should we send your design?</h1>
        <p>
          We'll email you the moment your room is ready — no spam, ever, and
          no pressure to buy anything else.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="email-input">Email address</label>
          <input
            id="email-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={value}
            onChange={onChange}
            disabled={isSubmitting}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'email-error' : undefined}
          />

          {error && (
            <p role="alert" id="email-error" style={{ marginTop: 'var(--space-2)' }}>
              {error}
            </p>
          )}

          {isSubmitting && (
            <p role="status" className="text-muted" style={{ marginTop: 'var(--space-2)' }}>
              Getting things ready…
            </p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            style={{ marginTop: 'var(--space-5)', width: '100%' }}
          >
            {isSubmitting ? 'Just a moment…' : 'Continue'}
          </Button>
        </form>
      </section>
    </FunnelLayout>
  );
}
