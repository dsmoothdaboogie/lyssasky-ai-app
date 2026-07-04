import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FunnelLayout } from './FunnelLayout';
import { Button } from '../components/Button';
import { useFunnelState } from './useFunnelState';
import { fetchLead, getImageUrl, apiSubmitFeedback, apiRegenerate, apiGetResultByToken } from '../firebase/api';
import { ensureAnonymousAuth } from '../firebase/client';

const GENERIC_ERROR = "Something went wrong on our end — please try again in a moment.";
const RATINGS = [1, 2, 3, 4, 5];

/**
 * Reached three ways:
 *  1. From WaitScreen once generation finishes (in-memory funnel state
 *     intact) — `leadId` comes from `useFunnelState()`.
 *  2. Directly via a `?lead=` link after a reload on the SAME device/session
 *     — falls back to the query param, same pattern as WaitScreen, and reads
 *     the lead with `fetchLead` (Firestore rules allow the owning
 *     `ownerUid`).
 *  3. The emailed cross-device link, `?lead=...&token=...` — opened on a
 *     brand-new device, this anonymous uid is NOT the lead's owner (it's a
 *     fresh uid), so `fetchLead` would be denied by firestore.rules. Instead
 *     this reads via the public `getResultByToken` callable, which trusts
 *     the opaque `leadToken` as the credential. Since this path can't prove
 *     ownership, it's read-only: rating/feedback/regenerate are all
 *     owner-guarded callables server-side, so those controls are hidden here
 *     rather than shown and left to fail.
 *
 * Generation is already done by the time this page loads, so a one-shot
 * fetch is enough in every case (no need for the realtime `watchLead`
 * subscription WaitScreen uses).
 */
export function ResultStep() {
  const [searchParams] = useSearchParams();
  const { leadId: stateLeadId, setLeadId, originalPhotoPreviewUrl, regenerateUsed, setRegenerateUsed } =
    useFunnelState();
  const navigate = useNavigate();

  const urlLeadId = searchParams.get('lead');
  const token = searchParams.get('token');
  const tokenMode = Boolean(urlLeadId && token);
  const owned = !tokenMode;

  const leadId = stateLeadId ?? urlLeadId;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(originalPhotoPreviewUrl);

  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!leadId) return undefined;

    let cancelled = false;

    (async () => {
      try {
        await ensureAnonymousAuth();

        if (tokenMode && token) {
          // Emailed cross-device link: this uid doesn't own the lead, so read
          // via the token-authenticated callable instead of fetchLead. Only
          // the generated image paths are returned (no before photo), and
          // there's nothing to claim into funnel state — this view is
          // read-only.
          const result = await apiGetResultByToken(leadId, token);
          if (cancelled || !mountedRef.current) return;

          if (result.imagePaths.length === 0) {
            setLoadError("We couldn't find your finished design just yet — please try again shortly.");
            setLoading(false);
            return;
          }

          const newestPath = result.imagePaths[result.imagePaths.length - 1];
          const url = await getImageUrl(newestPath);
          if (cancelled || !mountedRef.current) return;
          setAfterUrl(url);
          setLoading(false);
          return;
        }

        const lead = await fetchLead(leadId);
        if (cancelled || !mountedRef.current) return;

        if (!lead || lead.generatedImagePaths.length === 0) {
          setLoadError("We couldn't find your finished design just yet — please try again shortly.");
          setLoading(false);
          return;
        }

        setLeadId(leadId);

        const newestPath = lead.generatedImagePaths[lead.generatedImagePaths.length - 1];
        const url = await getImageUrl(newestPath);
        if (cancelled || !mountedRef.current) return;
        setAfterUrl(url);

        if (!originalPhotoPreviewUrl && lead.originalPhotoPath) {
          try {
            const before = await getImageUrl(lead.originalPhotoPath);
            if (!cancelled && mountedRef.current) setBeforeUrl(before);
          } catch {
            // Before photo is a nice-to-have — don't block the reveal on it.
          }
        }

        setLoading(false);
      } catch {
        if (cancelled || !mountedRef.current) return;
        setLoadError(GENERIC_ERROR);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, tokenMode, token]);

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

  const handleSubmit = async () => {
    if (rating === null) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await apiSubmitFeedback(leadId, rating, feedback);
      if (!mountedRef.current) return;
      navigate(`/book?lead=${leadId}`);
    } catch {
      if (!mountedRef.current) return;
      setSubmitError(GENERIC_ERROR);
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerateError(null);
    setRegenerating(true);
    // A paying customer gets exactly one free re-generate, win or lose — so
    // mark it used before the call, not just on success.
    setRegenerateUsed(true);
    try {
      await apiRegenerate(leadId);
      if (!mountedRef.current) return;
      navigate(`/wait?lead=${leadId}`);
    } catch {
      if (!mountedRef.current) return;
      setRegenerateError(GENERIC_ERROR);
    } finally {
      if (mountedRef.current) setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <FunnelLayout>
        <p role="status">Bringing up your new room…</p>
      </FunnelLayout>
    );
  }

  if (loadError) {
    return (
      <FunnelLayout>
        <section>
          <h1>Almost there</h1>
          <p role="alert">{loadError}</p>
        </section>
      </FunnelLayout>
    );
  }

  return (
    <FunnelLayout>
      <section>
        <h1>Your new room, reimagined</h1>
        <p>
          Here's a first look at your space. Think of this as a preview — Marjorie can take
          the details even further once you connect.
        </p>

        {beforeUrl && afterUrl && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-5)',
            }}
          >
            <figure style={{ margin: 0 }}>
              <img
                src={beforeUrl}
                alt="Your room before"
                style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
              />
              <figcaption className="text-muted" style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                Before
              </figcaption>
            </figure>
            <figure style={{ margin: 0 }}>
              <img
                src={afterUrl}
                alt="Your new room, after"
                style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
              />
              <figcaption className="text-muted" style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                After
              </figcaption>
            </figure>
          </div>
        )}

        {!(beforeUrl && afterUrl) && afterUrl && (
          <img
            src={afterUrl}
            alt="Your new room"
            style={{
              width: '100%',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-5)',
            }}
          />
        )}

        {owned && (
          <>
            <h2>How close is this to your vision?</h2>
            <div
              role="group"
              aria-label="How close is this to your vision?"
              style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}
            >
              {RATINGS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`btn ${rating === n ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={rating === n}
                  onClick={() => setRating(n)}
                >
                  {n}
                </button>
              ))}
            </div>

            <label htmlFor="result-feedback">
              <h2>What would you change?</h2>
            </label>
            <textarea
              id="result-feedback"
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Optional — tell us what you'd tweak"
              aria-label="What would you change?"
            />

            {submitError && (
              <p role="alert" style={{ marginTop: 'var(--space-3)' }}>
                {submitError}
              </p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={rating === null || submitting}
              style={{ marginTop: 'var(--space-4)', width: '100%' }}
            >
              {submitting ? 'Submitting…' : 'Continue'}
            </Button>

            {!regenerateUsed && (
              <div style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
                <p className="text-muted" style={{ marginBottom: 'var(--space-2)' }}>
                  Not quite right? You get one free re-generate.
                </p>
                <Button
                  variant="secondary"
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  style={{ width: '100%' }}
                >
                  {regenerating ? 'Starting over…' : 'Try another version'}
                </Button>
                {regenerateError && (
                  <p role="alert" style={{ marginTop: 'var(--space-3)' }}>
                    {regenerateError}
                  </p>
                )}
              </div>
            )}
            {regenerateUsed && (
              <p className="text-muted" style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
                You've used your free re-generate — Marjorie can refine things further after you
                connect.
              </p>
            )}
          </>
        )}

        {!owned && (
          <p className="text-muted" style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
            This is your emailed preview link — open it on the device you started on to rate it
            or book a consult.
          </p>
        )}
      </section>
    </FunnelLayout>
  );
}
