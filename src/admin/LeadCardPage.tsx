import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../components/Button';
import { apiAdminMarkPerkRedeemed, apiAdminRestoreRestyle, apiRegenerate, fetchAllStyles, fetchLead, getImageUrl } from '../firebase/api';
import { INTEREST_LABELS } from '../domain/pass';
import { DEFAULT_CONFIG } from '../config/defaultConfig';
import type { Lead, LeadStatus, QuestionnaireAnswers } from '../domain/types';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatTimestamp(ms: number): string {
  return dateFormatter.format(new Date(ms));
}

/** Builds a `value -> label` lookup per single-choice question, from the questionnaire config. */
function buildLabelMaps() {
  const maps: Partial<Record<keyof QuestionnaireAnswers, Map<string, string>>> = {};
  for (const question of DEFAULT_CONFIG.questionnaire) {
    if (!question.options) continue;
    maps[question.id] = new Map(question.options.map((opt) => [opt.value, opt.label]));
  }
  return maps;
}

const LABEL_MAPS = buildLabelMaps();

function labelFor(questionId: keyof QuestionnaireAnswers, value: string | undefined): string {
  if (!value) return '—';
  return LABEL_MAPS[questionId]?.get(value) ?? value;
}

const STATUS_ORDER: LeadStatus[] = ['captured', 'paid', 'generated', 'rated', 'booked', 'failed'];

/**
 * Resolves each Storage path in `paths` to a viewable URL, in order.
 * Skips resolution entirely when there's nothing to fetch.
 */
function useImageUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  // Stable dependency: re-resolve only when the set of paths actually changes.
  const key = paths.join('|');

  useEffect(() => {
    let cancelled = false;
    if (paths.length === 0) {
      setUrls({});
      return;
    }
    Promise.all(paths.map((path) => getImageUrl(path).then((url) => [path, url] as const))).then(
      (pairs) => {
        if (cancelled) return;
        setUrls(Object.fromEntries(pairs));
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urls;
}

/**
 * Admin-only pre-consult briefing for a single lead, at /admin/leads/:id.
 * Surfaces everything Marjorie needs before a consult call: the customer's
 * photo, questionnaire answers (as human labels, not slugs), what the AI
 * produced, their rating/feedback, payment + booking state, and a timeline
 * of status transitions. Also offers an admin-only re-run of generation for
 * failed or unsatisfying results.
 */
export function LeadCardPage() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<Lead | null | undefined>(undefined);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerated, setRegenerated] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [styleNames, setStyleNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetchAllStyles()
      .then((all) => {
        if (!cancelled) setStyleNames(new Map(all.map((st) => [st.slug, st.name])));
      })
      .catch(() => {}); // best-effort: the looks list falls back to slugs
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLead(undefined);
    fetchLead(id).then((result) => {
      if (!cancelled) setLead(result ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const imagePaths = useMemo(() => {
    if (!lead) return [];
    const paths: string[] = [];
    if (lead.originalPhotoPath) paths.push(lead.originalPhotoPath);
    paths.push(...lead.generatedImagePaths);
    return paths;
  }, [lead]);

  const imageUrls = useImageUrls(imagePaths);

  if (lead === undefined) {
    return (
      <div className="admin-shell admin-shell-centered">
        <p role="status">Loading lead…</p>
      </div>
    );
  }

  if (lead === null) {
    return (
      <div className="admin-shell admin-shell-centered">
        <div className="card">
          <p role="alert">Lead not found.</p>
          <Link to="/admin/leads">Back to leads</Link>
        </div>
      </div>
    );
  }

  const generatedPaths = lead.generatedImagePaths;
  const latestGeneratedPath = generatedPaths[generatedPaths.length - 1];
  const olderGeneratedPaths = generatedPaths.slice(0, -1);

  async function handleRegenerate() {
    if (!id) return;
    setRegenerating(true);
    setRegenerateError(null);
    try {
      await apiRegenerate(id);
      setRegenerated(true);
    } catch (err) {
      setRegenerateError(err instanceof Error ? err.message : 'Failed to re-run generation.');
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div>
      <p>
        <Link to="/admin/leads">&larr; Back to leads</Link>
      </p>

      <h1>{lead.email ?? '(no email yet)'}</h1>

      <section className="card">
        <h2>Photos</h2>
        <div className="lead-card-photos">
          <div>
            <p className="text-muted">Original</p>
            {lead.originalPhotoPath ? (
              <img
                src={imageUrls[lead.originalPhotoPath]}
                alt="Original room photo"
                className="lead-card-photo-main"
              />
            ) : (
              <p className="text-muted">No photo uploaded.</p>
            )}
          </div>
          <div>
            <p className="text-muted">Latest generated design</p>
            {latestGeneratedPath ? (
              <img
                src={imageUrls[latestGeneratedPath]}
                alt="Latest generated design"
                className="lead-card-photo-main"
              />
            ) : (
              <p className="text-muted">No design generated yet.</p>
            )}
            {olderGeneratedPaths.length > 0 && (
              <div className="lead-card-thumbnails">
                {olderGeneratedPaths.map((path) => (
                  <img
                    key={path}
                    src={imageUrls[path]}
                    alt="Earlier generated design"
                    className="lead-card-photo-thumb"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Questionnaire answers</h2>
        <dl className="lead-card-answers">
          <dt>Room</dt>
          <dd>{labelFor('roomType', lead.answers?.roomType)}</dd>
          <dt>Style</dt>
          <dd>{lead.answers?.styleSlug ?? '—'}</dd>
          <dt>Mood</dt>
          <dd>{labelFor('colorMood', lead.answers?.colorMood)}</dd>
          <dt>Keep</dt>
          <dd>{lead.answers?.keep || '—'}</dd>
          <dt>Budget</dt>
          <dd>{labelFor('budget', lead.answers?.budget)}</dd>
          <dt>Timeline</dt>
          <dd>{labelFor('timeline', lead.answers?.timeline)}</dd>
          <dt>Email</dt>
          <dd>{lead.email ?? '—'}</dd>
        </dl>
      </section>

      <section className="card">
        <h2>Rating &amp; feedback</h2>
        {lead.rating != null ? (
          <p>{lead.rating}/5</p>
        ) : (
          <p className="text-muted">No rating yet.</p>
        )}
        {lead.feedback ? <p>{lead.feedback}</p> : <p className="text-muted">No feedback yet.</p>}
      </section>

      <section className="card">
        <h2>Payment</h2>
        <p>
          {lead.paymentId
            ? `Paid (payment ID: ${lead.paymentId})`
            : 'Not paid yet.'}
        </p>
      </section>

      {lead.pass && (
        <section className="card" aria-label="Room Pass">
          <h2>Room Pass</h2>
          <p>
            {lead.pass.restylesUsed} of {lead.pass.restylesTotal} restyles used · ends{' '}
            {formatTimestamp(lead.pass.expiresAt)}
          </p>
          {lead.pass.restylesUsed > 0 && (
            <Button
              disabled={restoring}
              onClick={async () => {
                setRestoring(true);
                setRestoreError(null);
                try {
                  const { restylesUsed } = await apiAdminRestoreRestyle(lead.id);
                  const { inFlight: _inFlight, ...pass } = lead.pass!;
                  setLead({ ...lead, pass: { ...pass, restylesUsed } });
                } catch {
                  setRestoreError("Couldn't give back the restyle — please try again.");
                } finally {
                  setRestoring(false);
                }
              }}
            >
              Give back 1 restyle
            </Button>
          )}
          {restoreError && <p role="alert">{restoreError}</p>}
          {lead.perk && (
            <>
              <p>
                Perk <strong>{lead.perk.code}</strong> — {lead.perk.discountPct}% off, valid until{' '}
                {formatTimestamp(lead.perk.validUntil)}
              </p>
              {lead.perk.redeemedAt != null ? (
                <p>Redeemed {formatTimestamp(lead.perk.redeemedAt)}</p>
              ) : (
                <Button
                  disabled={redeeming}
                  onClick={async () => {
                    setRedeeming(true);
                    setRedeemError(null);
                    try {
                      await apiAdminMarkPerkRedeemed(lead.id);
                      setLead({ ...lead, perk: { ...lead.perk!, redeemedAt: Date.now() } });
                    } catch {
                      setRedeemError("Couldn't mark the perk redeemed — please try again.");
                    } finally {
                      setRedeeming(false);
                    }
                  }}
                >
                  Mark perk redeemed
                </Button>
              )}
              {redeemError && <p role="alert">{redeemError}</p>}
            </>
          )}
          {lead.looks && lead.looks.length > 0 && (
            <ol>
              {lead.looks.map((look) => (
                <li key={look.imagePath}>{`${styleNames.get(look.styleSlug) ?? look.styleSlug} · ${labelFor('colorMood', look.colorMood)}`}</li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="card">
        <h2>Booking</h2>
        {lead.booking ? (
          <dl className="lead-card-answers">
            <dt>Name</dt>
            <dd>{lead.booking.name}</dd>
            <dt>Phone</dt>
            <dd>{lead.booking.phone || '—'}</dd>
            <dt>Note</dt>
            <dd>{lead.booking.note || '—'}</dd>
            <dt>Interested in</dt>
            <dd>{lead.booking.interest ? INTEREST_LABELS[lead.booking.interest] : '—'}</dd>
          </dl>
        ) : (
          <p className="text-muted">Not booked yet.</p>
        )}
      </section>

      <section className="card">
        <h2>Timeline</h2>
        <dl className="lead-card-answers">
          {STATUS_ORDER.map((status) => (
            <Fragment key={status}>
              <dt>{status}</dt>
              <dd>
                {lead.timestamps[status] != null
                  ? formatTimestamp(lead.timestamps[status]!)
                  : '—'}
              </dd>
            </Fragment>
          ))}
        </dl>
      </section>

      <section className="card">
        <h2>Admin actions</h2>
        <Button onClick={() => void handleRegenerate()} disabled={regenerating}>
          {regenerating ? 'Re-running…' : 'Re-run generation'}
        </Button>
        {regenerated && (
          <p role="status">Re-running generation — the lead will update shortly.</p>
        )}
        {regenerateError && <p role="alert">{regenerateError}</p>}
      </section>
    </div>
  );
}
