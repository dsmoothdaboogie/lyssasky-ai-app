import { useEffect, useState } from 'react';
import { apiAdminGetAnalytics } from '../firebase/api';
import type { AnalyticsSummary } from '../domain/types';

const GENERIC_ERROR = 'Something went wrong loading analytics — please try again.';

/** avg rating below this flags the style as needing recipe attention. */
const LOW_RATING_THRESHOLD = 3;

const FUNNEL_STAGES: { key: keyof AnalyticsSummary['funnel']; label: string }[] = [
  { key: 'captured', label: 'Captured' },
  { key: 'paid', label: 'Paid' },
  { key: 'generated', label: 'Generated' },
  { key: 'rated', label: 'Rated' },
  { key: 'booked', label: 'Booked' },
];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="admin-stat-tile" aria-label={`${label}: ${value}`}>
      <span className="admin-stat-value" aria-hidden="true">
        {value}
      </span>
      <span className="admin-stat-label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}

/** A horizontal CSS bar: fill width is `value / max` as a percentage. */
function BarRow({
  label,
  value,
  max,
  displayValue,
  flagged,
  flagText,
}: {
  label: string;
  value: number;
  max: number;
  displayValue?: string | number;
  flagged?: boolean;
  flagText?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <li className={`admin-bar-row${flagged ? ' admin-bar-row-flagged' : ''}`}>
      <span className="admin-bar-label">{label}</span>
      <div className="admin-bar-track">
        <div
          className={`admin-bar-fill${flagged ? ' admin-bar-fill-flagged' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="admin-bar-value">{displayValue ?? value}</span>
      {flagged && flagText && <span className="admin-bar-flag">{flagText}</span>}
    </li>
  );
}

function distributionMax(dist: Record<string, number>): number {
  const values = Object.values(dist);
  return values.length > 0 ? Math.max(...values) : 0;
}

function DistributionBars({ dist }: { dist: Record<string, number> }) {
  const entries = Object.entries(dist);
  if (entries.length === 0) {
    return <p className="text-muted">No data yet.</p>;
  }
  const max = distributionMax(dist);
  return (
    <ul className="admin-bar-list">
      {entries.map(([key, count]) => (
        <BarRow key={key} label={key} value={count} max={max} />
      ))}
    </ul>
  );
}

/**
 * Admin analytics dashboard at `/admin/analytics`. Loads the aggregated
 * `AnalyticsSummary` (functions/src/admin/analytics.ts, via
 * apiAdminGetAnalytics) on mount and renders it as stat tiles + simple
 * CSS bar charts — no chart library, so the page stays fully offline-safe.
 */
export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiAdminGetAnalytics()
      .then((summary) => {
        if (cancelled) return;
        setData(summary);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : GENERIC_ERROR);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="admin-shell admin-shell-centered">
        <p role="status">Loading analytics…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="admin-shell admin-shell-centered">
        <p role="alert">{error ?? GENERIC_ERROR}</p>
      </div>
    );
  }

  const funnelMax = Math.max(1, ...FUNNEL_STAGES.map((s) => data.funnel[s.key]));
  const stylePopularityMax = Math.max(1, ...data.stylePopularity.map((s) => s.count));

  return (
    <div>
      <h1>Analytics</h1>

      <section className="card admin-analytics-section" aria-label="Funnel">
        <h2>Funnel</h2>
        {data.totalLeads === 0 ? (
          <p className="text-muted">No leads yet.</p>
        ) : (
          <>
            <div className="admin-stat-grid">
              {FUNNEL_STAGES.map((stage) => (
                <StatTile key={stage.key} label={stage.label} value={data.funnel[stage.key]} />
              ))}
              <StatTile label="Failed" value={data.funnel.failed} />
            </div>
            <ul className="admin-bar-list">
              {FUNNEL_STAGES.map((stage) => (
                <BarRow
                  key={stage.key}
                  label={stage.label}
                  value={data.funnel[stage.key]}
                  max={funnelMax}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card admin-analytics-section" aria-label="Revenue">
        <h2>Revenue</h2>
        <div className="admin-stat-grid">
          <StatTile label="Revenue" value={formatCents(data.revenueCents)} />
          <StatTile label="Total leads" value={data.totalLeads} />
        </div>
      </section>

      <section className="card admin-analytics-section" aria-label="Style popularity">
        <h2>Style popularity</h2>
        {data.stylePopularity.length === 0 ? (
          <p className="text-muted">No style data yet.</p>
        ) : (
          <ul className="admin-bar-list">
            {data.stylePopularity.map((s) => (
              <BarRow key={s.slug} label={s.slug} value={s.count} max={stylePopularityMax} />
            ))}
          </ul>
        )}
      </section>

      <section className="card admin-analytics-section" aria-label="Average rating by style">
        <h2>Average rating by style</h2>
        {data.avgRatingByStyle.length === 0 ? (
          <p className="text-muted">No ratings yet.</p>
        ) : (
          <ul className="admin-bar-list">
            {data.avgRatingByStyle.map((s) => {
              const flagged = s.avg < LOW_RATING_THRESHOLD;
              return (
                <BarRow
                  key={s.slug}
                  label={`${s.slug} (${s.count} rating${s.count === 1 ? '' : 's'})`}
                  value={s.avg}
                  max={5}
                  displayValue={s.avg.toFixed(1)}
                  flagged={flagged}
                  flagText="recipe needs test-bench work"
                />
              );
            })}
          </ul>
        )}
      </section>

      <section className="card admin-analytics-section" aria-label="Budget distribution">
        <h2>Budget distribution</h2>
        <DistributionBars dist={data.budgetDistribution} />
      </section>

      <section className="card admin-analytics-section" aria-label="Timeline distribution">
        <h2>Timeline distribution</h2>
        <DistributionBars dist={data.timelineDistribution} />
      </section>

      <section className="card admin-analytics-section" aria-label="Generation stats">
        <h2>Generation stats</h2>
        <div className="admin-stat-grid">
          <StatTile label="Total" value={data.generations.total} />
          <StatTile label="Failed" value={data.generations.failed} />
          <StatTile
            label="Avg duration"
            value={`${(data.generations.avgDurationMs / 1000).toFixed(1)}s`}
          />
          <StatTile label="Est. cost" value={formatCents(data.generations.estCostCents)} />
        </div>
      </section>
    </div>
  );
}
