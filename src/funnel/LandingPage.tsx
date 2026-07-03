import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FunnelLayout } from './FunnelLayout';
import { Button } from '../components/Button';
import { apiLogEvent } from '../firebase/api';

interface BeforeAfterTile {
  label: string;
  beforeColor: string;
  afterColor: string;
}

// Warm, offline-safe placeholder art — no remote images, just inline SVG
// gradients in on-brand tones standing in for real room photos.
const EXAMPLE_TILES: BeforeAfterTile[] = [
  { label: 'Living room, warmed up', beforeColor: '#d8cfc2', afterColor: '#c67b5c' },
  { label: 'Bedroom, softened', beforeColor: '#dcd3c9', afterColor: '#a9835f' },
  { label: 'Reading nook, restyled', beforeColor: '#d3c9bb', afterColor: '#7c8a72' },
];

function RoomTile({ color, tone }: { color: string; tone: 'before' | 'after' }) {
  const gradientId = `tile-gradient-${tone}-${color.replace('#', '')}`;
  return (
    <svg
      viewBox="0 0 120 90"
      role="img"
      aria-label={tone === 'before' ? 'Before: current room' : 'After: restyled room preview'}
      style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-sm)', display: 'block' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={tone === 'before' ? 0.55 : 0.95} />
          <stop offset="100%" stopColor={color} stopOpacity={tone === 'before' ? 0.3 : 0.7} />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill={`url(#${gradientId})`} />
      <rect x="10" y="55" width="30" height="25" fill="#fff" opacity={tone === 'before' ? 0.25 : 0.45} />
      <rect x="70" y="20" width="40" height="15" fill="#fff" opacity={tone === 'before' ? 0.2 : 0.4} />
    </svg>
  );
}

/**
 * Funnel entry point. Sets the warm, no-pressure tone, shows a few
 * illustrative before/after tiles (inline SVG only — no remote assets),
 * and hands off to the upload step for a $5 restyle preview.
 */
export function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    apiLogEvent('page_view');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FunnelLayout>
      <section>
        <h1>See your room, restyled</h1>
        <p>
          Upload one photo of your space and get a personalized restyle preview for just{' '}
          <strong>$5</strong>. It's a first look — a gentle "here's what's possible," not a
          finished redesign. If you love the direction, Marjorie can take it further.
        </p>
      </section>

      <section aria-label="Example restyles" style={{ marginBottom: 'var(--space-6)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {EXAMPLE_TILES.map((tile) => (
            <div key={tile.label} className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <RoomTile color={tile.beforeColor} tone="before" />
                <RoomTile color={tile.afterColor} tone="after" />
              </div>
              <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.85rem', textAlign: 'center' }}>
                {tile.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Button onClick={() => navigate('/upload')}>See your room, restyled — $5</Button>
        <p className="text-muted" style={{ marginTop: 'var(--space-3)', fontSize: '0.9rem' }}>
          No pressure, no judgment — just a warm, honest look at what your room could feel like.
        </p>
      </section>
    </FunnelLayout>
  );
}
