import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FunnelLayout } from './FunnelLayout';
import { Button } from '../components/Button';
import { StylePicker } from './StylePicker';
import { useFunnelState } from './useFunnelState';
import {
  fetchLead, getImageUrl, apiSubmitFeedback, apiRestyle, apiGetResultByToken,
  fetchActiveStyles, fetchAppConfig,
} from '../firebase/api';
import { ensureAnonymousAuth } from '../firebase/client';
import { isPassExpired, isPerkValid, restylesLeft } from '../domain/pass';
import type { LeadPass, LeadPerk, LeadStatus, Style, QuestionOption } from '../domain/types';

const GENERIC_ERROR = "Something went wrong on our end — please try again in a moment.";
const RATINGS = [1, 2, 3, 4, 5];
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Toronto' });
const fmt = (ms: number) => shortDate.format(new Date(ms));

interface ViewLook { url: string; styleSlug?: string; colorMood?: string }
interface View {
  status: LeadStatus;
  looks: ViewLook[];
  pass: LeadPass | null;
  perk: LeadPerk | null;
}

/** Normalizes an owned lead into the same shape the token callable returns. */
async function loadOwnedView(leadId: string): Promise<{ view: View; originalPath?: string } | null> {
  const lead = await fetchLead(leadId);
  if (!lead || lead.generatedImagePaths.length === 0) return null;
  const source = lead.looks?.length
    ? lead.looks
    : lead.generatedImagePaths.map((imagePath) => ({ imagePath, styleSlug: undefined, colorMood: undefined }));
  const looks = await Promise.all(
    source.map(async (l) => ({ url: await getImageUrl(l.imagePath), styleSlug: l.styleSlug, colorMood: l.colorMood })),
  );
  return {
    view: { status: lead.status, looks, pass: lead.pass ?? null, perk: lead.perk ?? null },
    originalPath: lead.originalPhotoPath,
  };
}

function errorMessage(err: unknown): string {
  // HttpsError messages from `restyle` are written for customers; SDK-generated
  // failures (deadline-exceeded, internal) carry the bare code as the message.
  const code = (err as { code?: string } | null)?.code ?? '';
  if (!code.startsWith('functions/') || !(err instanceof Error)) return GENERIC_ERROR;
  const message = err.message.trim();
  return message && message !== code.replace('functions/', '') ? message : GENERIC_ERROR;
}

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
 *     ownership, it's read-only: rating/feedback/restyle are all
 *     owner-guarded callables server-side, so those controls are hidden here
 *     rather than shown and left to fail. It still shows the looks strip and
 *     the Marjorie perk.
 *
 * Generation is already done by the time this page loads, so a one-shot
 * fetch is enough in every case (no need for the realtime `watchLead`
 * subscription WaitScreen uses).
 */
export function ResultStep() {
  const [searchParams] = useSearchParams();
  const { leadId: stateLeadId, setLeadId, originalPhotoPreviewUrl } = useFunnelState();
  const navigate = useNavigate();

  const urlLeadId = searchParams.get('lead');
  const token = searchParams.get('token');
  const tokenMode = Boolean(urlLeadId && token);
  const owned = !tokenMode;

  const leadId = stateLeadId ?? urlLeadId;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(originalPhotoPreviewUrl);

  const [styles, setStyles] = useState<Style[]>([]);
  const [moods, setMoods] = useState<QuestionOption[]>([]);

  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [restyling, setRestyling] = useState(false);
  const [restyleError, setRestyleError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyView = useCallback((v: View) => {
    setView(v);
    setCurrentIndex(v.looks.length - 1);
  }, []);

  useEffect(() => {
    if (!leadId) return undefined;

    let cancelled = false;

    (async () => {
      try {
        await ensureAnonymousAuth();

        // Labels for looks (style names, mood labels) — best-effort.
        Promise.all([fetchActiveStyles(), fetchAppConfig()])
          .then(([s, cfg]) => {
            if (cancelled || !mountedRef.current) return;
            setStyles(s);
            setMoods(cfg.questionnaire.find((q) => q.id === 'colorMood')?.options ?? []);
          })
          .catch(() => {});

        if (tokenMode && token) {
          // Emailed cross-device link: this uid doesn't own the lead, so read
          // via the token-authenticated callable instead of fetchLead. It
          // returns already-resolved download URLs (resolved server-side with
          // the Admin SDK, since this uid can't resolve
          // `leads/{ownerUid}/generated/*` paths itself via getImageUrl) —
          // no before photo, and nothing to claim into funnel state, since
          // this view is read-only.
          const result = await apiGetResultByToken(leadId, token);
          if (cancelled || !mountedRef.current) return;

          const looks: ViewLook[] = result.looks.length
            ? result.looks
            : result.imageUrls.map((url) => ({ url }));
          if (looks.length === 0) {
            setLoadError("We couldn't find your finished design just yet — please try again shortly.");
            setLoading(false);
            return;
          }

          applyView({ status: result.status, looks, pass: result.pass, perk: result.perk });
          setLoading(false);
          return;
        }

        const ownedView = await loadOwnedView(leadId);
        if (cancelled || !mountedRef.current) return;

        if (!ownedView) {
          setLoadError("We couldn't find your finished design just yet — please try again shortly.");
          setLoading(false);
          return;
        }

        setLeadId(leadId);
        applyView(ownedView.view);

        if (!originalPhotoPreviewUrl && ownedView.originalPath) {
          try {
            const before = await getImageUrl(ownedView.originalPath);
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

  const styleName = useMemo(() => new Map(styles.map((s) => [s.slug, s.name])), [styles]);
  const moodLabel = useMemo(() => new Map(moods.map((m) => [m.value, m.label])), [moods]);
  const labelOf = (l: ViewLook) =>
    l.styleSlug && l.colorMood
      ? `${styleName.get(l.styleSlug) ?? l.styleSlug} · ${moodLabel.get(l.colorMood) ?? l.colorMood}`
      : null;

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

  const handleRestyle = async (styleSlug: string, colorMood: string) => {
    setRestyleError(null);
    setRestyling(true);
    try {
      await apiRestyle(leadId, styleSlug, colorMood);
      const refreshed = await loadOwnedView(leadId);
      if (!mountedRef.current) return;
      if (refreshed) applyView(refreshed.view);
      setPickerOpen(false);
    } catch (err) {
      if (!mountedRef.current) return;
      setRestyleError(errorMessage(err));
      // The server may have finished after the client gave up — show any look
      // that landed and the true restyle count. Best-effort only.
      try {
        const refreshed = await loadOwnedView(leadId);
        if (mountedRef.current && refreshed) applyView(refreshed.view);
      } catch {
        // Keep the error shown; the refresh is a nicety.
      }
    } finally {
      if (mountedRef.current) setRestyling(false);
    }
  };

  if (loading) {
    return (
      <FunnelLayout>
        <p role="status">Bringing up your new room…</p>
      </FunnelLayout>
    );
  }

  if (loadError || !view) {
    return (
      <FunnelLayout>
        <section>
          <h1>Almost there</h1>
          <p role="alert">{loadError ?? GENERIC_ERROR}</p>
        </section>
      </FunnelLayout>
    );
  }

  const now = Date.now();
  const current = view.looks[currentIndex];
  const currentLabel = labelOf(current);
  const afterUrl = current.url;
  const hasPass = view.pass !== null;
  const left = view.pass ? restylesLeft({ pass: view.pass }) : 0;
  const expired = view.pass !== null && isPassExpired({ pass: view.pass }, now);
  const passOpen = view.pass !== null && !expired && left > 0;
  const showPerk = view.perk !== null && isPerkValid({ perk: view.perk }, now);
  const tried = new Set(view.looks.map((l) => l.styleSlug).filter((s): s is string => !!s));
  const lookCount = view.looks.length;

  let passStatus = '';
  if (view.pass) {
    if (expired) passStatus = 'Room Pass ended';
    else if (left === 0) passStatus = `No restyles left · ends ${fmt(view.pass.expiresAt)}`;
    else passStatus = `${left} restyle${left === 1 ? '' : 's'} left · ends ${fmt(view.pass.expiresAt)}`;
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

        {currentLabel && <p style={{ textAlign: 'center', fontWeight: 600 }}>{currentLabel}</p>}

        {lookCount > 1 && (
          <div aria-label="Your looks" role="group" style={{ marginBottom: 'var(--space-4)' }}>
            <h2>Your looks</h2>
            <div style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto' }}>
              {view.looks.map((l, i) => (
                <button
                  key={l.url}
                  type="button"
                  aria-pressed={i === currentIndex}
                  aria-label={`Look ${i + 1}${labelOf(l) ? `: ${labelOf(l)}` : ''}`}
                  onClick={() => setCurrentIndex(i)}
                  style={{
                    padding: 0, flex: '0 0 72px', borderRadius: 'var(--radius-sm)',
                    border: i === currentIndex ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                  }}
                >
                  <img src={l.url} alt="" style={{ width: '72px', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {hasPass && (
          <p className="text-muted" style={{ textAlign: 'center' }}>{passStatus}</p>
        )}

        {owned && passOpen && !pickerOpen && (
          <Button variant="secondary" onClick={() => setPickerOpen(true)} style={{ width: '100%' }}>
            Try another look
          </Button>
        )}

        {owned && passOpen && pickerOpen && (
          <div className="card" style={{ padding: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
            {restyling ? (
              <div style={{ textAlign: 'center' }}>
                <div className="wait-animation" aria-hidden="true">
                  <span className="wait-pulse" />
                  <span className="wait-pulse wait-pulse-delay" />
                </div>
                <p role="status">Styling your new look…</p>
              </div>
            ) : (
              <StylePicker
                styles={styles.map((s) => ({ slug: s.slug, name: s.name, imageUrl: s.galleryImages[0] }))}
                moods={moods}
                triedStyles={tried}
                busy={restyling}
                onSubmit={(s, m) => void handleRestyle(s, m)}
              />
            )}
            {restyleError && <p role="alert" style={{ marginTop: 'var(--space-3)' }}>{restyleError}</p>}
          </div>
        )}

        {owned && hasPass && !passOpen && (
          <div style={{ marginTop: 'var(--space-4)', textAlign: 'center' }}>
            <p>
              You've explored {lookCount} look{lookCount === 1 ? '' : 's'} — next step: talk them through with Marjorie.
            </p>
            <Link to="/" className="text-muted">Start a new Room Pass</Link>
          </div>
        )}

        {(hasPass || showPerk) && (
          <div className="card" style={{ padding: 'var(--space-4)', marginTop: 'var(--space-5)' }}>
            <h2>Make it real with Marjorie</h2>
            {owned && (
              <Link to={`/book?lead=${leadId}`} className="btn btn-primary" style={{ display: 'block', textAlign: 'center' }}>
                Book your free 15-min chat — Marjorie will have your looks ready
              </Link>
            )}
            {showPerk && (
              <p style={{ marginTop: 'var(--space-3)' }}>
                {view.perk!.discountPct}% off Virtual Styling (from $250) or Room Refresh (from $650) — code{' '}
                <strong>{view.perk!.code}</strong>, valid until {fmt(view.perk!.validUntil)}
              </p>
            )}
          </div>
        )}

        {owned && view.status === 'generated' && (
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
          </>
        )}

        {!owned && (
          <p className="text-muted" style={{ marginTop: 'var(--space-5)', textAlign: 'center' }}>
            This is your emailed preview link — open it on the device you started on to rate it,
            try more looks, or book a consult.
          </p>
        )}
      </section>
    </FunnelLayout>
  );
}
