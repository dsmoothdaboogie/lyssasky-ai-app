import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FunnelLayout } from './FunnelLayout';
import { Button } from '../components/Button';
import { useFunnelState } from './useFunnelState';
import { apiSubmitBooking, fetchAppConfig, fetchLead } from '../firebase/api';
import { ensureAnonymousAuth } from '../firebase/client';
import { BOOKING_INTERESTS, INTEREST_LABELS, isPerkValid } from '../domain/pass';
import type { BookingInterest, LeadPerk } from '../domain/types';

const GENERIC_ERROR = "Something went wrong on our end — please try again in a moment.";

/**
 * Final funnel screen: a warm lead-capture form (framed as booking a
 * consultation with stylist Marjorie to close the gap between the $5
 * preview and the customer's true vision) plus a Calendly embed so they
 * can pick a time right away. `leadId` is resolved from funnel state
 * first, falling back to the `?lead=` query param, same pattern as
 * ResultStep/WaitScreen. The Calendly URL comes from remote config
 * (`fetchAppConfig`), never hardcoded here.
 */
export function BookingStep() {
  const [searchParams] = useSearchParams();
  const { leadId: stateLeadId } = useFunnelState();
  const leadId = stateLeadId ?? searchParams.get('lead');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [interest, setInterest] = useState<BookingInterest>('chat');
  const [perk, setPerk] = useState<LeadPerk | null>(null);

  const [calendlyUrl, setCalendlyUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await fetchAppConfig();
        if (!cancelled) setCalendlyUrl(config.calendlyUrl);
      } catch {
        // Calendly is a nice-to-have on this screen — the form submission
        // above it is the functional part, so don't block on this.
      }
      if (leadId) {
        try {
          await ensureAnonymousAuth();
          const lead = await fetchLead(leadId);
          if (!cancelled && lead?.perk && isPerkValid(lead, Date.now())) setPerk(lead.perk);
        } catch { /* perk display is a nice-to-have */ }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const onNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (error) setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Mind sharing your name so Marjorie knows who to expect?");
      return;
    }

    if (!leadId) {
      setError(GENERIC_ERROR);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await ensureAnonymousAuth();
      const trimmedPhone = phone.trim();
      const trimmedNote = note.trim();
      await apiSubmitBooking(leadId, {
        name: trimmedName,
        interest,
        ...(trimmedPhone ? { phone: trimmedPhone } : {}),
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
      setSubmitted(true);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FunnelLayout step={5} totalSteps={5}>
      <section>
        <h1>Let's take this from preview to real life</h1>
        <p>
          That $5 preview is just a glimpse — a real consultation with our stylist Marjorie
          is where your space actually comes together. No pressure at all — just a friendly
          chat about what you're picturing.
        </p>
        {perk && (
          <p className="card" style={{ padding: 'var(--space-3)' }}>
            Your Room Pass perk: <strong>{perk.discountPct}% off</strong> Virtual Styling or Room Refresh with code{' '}
            <strong>{perk.code}</strong>. Mention it when you book — Marjorie will apply it.
          </p>
        )}

        {submitted ? (
          <p role="status" style={{ marginTop: 'var(--space-4)' }}>
            You're all set — Marjorie will be in touch. Pick a time below whenever you're ready.
          </p>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="booking-interest">I'm interested in</label>
            <select
              id="booking-interest"
              value={interest}
              onChange={(e) => setInterest(e.target.value as BookingInterest)}
              disabled={isSubmitting}
            >
              {BOOKING_INTERESTS.map((i) => (
                <option key={i} value={i}>{INTEREST_LABELS[i]}</option>
              ))}
            </select>

            <label htmlFor="booking-name" style={{ marginTop: 'var(--space-3)', display: 'block' }}>Name</label>
            <input
              id="booking-name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              value={name}
              onChange={onNameChange}
              disabled={isSubmitting}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'booking-error' : undefined}
            />

            <label htmlFor="booking-phone" style={{ marginTop: 'var(--space-3)', display: 'block' }}>
              Phone (optional)
            </label>
            <input
              id="booking-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Your phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
            />

            <label htmlFor="booking-note" style={{ marginTop: 'var(--space-3)', display: 'block' }}>
              Anything you'd like Marjorie to know? (optional)
            </label>
            <textarea
              id="booking-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tell us a bit more about your space or your vision"
              disabled={isSubmitting}
            />

            {error && (
              <p role="alert" id="booking-error" style={{ marginTop: 'var(--space-2)' }}>
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              style={{ marginTop: 'var(--space-5)', width: '100%' }}
            >
              {isSubmitting ? 'Just a moment…' : 'Book my consultation'}
            </Button>
          </form>
        )}

        {calendlyUrl && (
          <div style={{ marginTop: 'var(--space-6)' }}>
            <h2>Pick a time</h2>
            <iframe
              src={calendlyUrl}
              title="Book with Marjorie"
              style={{ width: '100%', minHeight: '600px', border: 'none' }}
            />
          </div>
        )}
      </section>
    </FunnelLayout>
  );
}
