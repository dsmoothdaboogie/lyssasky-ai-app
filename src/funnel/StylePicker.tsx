import { useState } from 'react';
import { Button } from '../components/Button';

export interface PickerStyle { slug: string; name: string; imageUrl?: string }
export interface PickerMood { value: string; label: string }

/**
 * Restyle picker on the result page: gallery cards for style, chips for
 * color mood, then Restyle. Mirrors QuestionnaireStep's gallery/single
 * markup so the two feel identical. Already-tried styles are labeled but
 * stay selectable (a new mood on a tried style is a legit restyle).
 */
export function StylePicker({
  styles, moods, triedStyles, busy, onSubmit,
}: {
  styles: PickerStyle[];
  moods: PickerMood[];
  triedStyles: Set<string>;
  busy: boolean;
  onSubmit(styleSlug: string, colorMood: string): void;
}) {
  const [styleSlug, setStyleSlug] = useState<string | null>(null);
  const [colorMood, setColorMood] = useState<string | null>(null);

  return (
    <div>
      <h3>Pick a style</h3>
      <div
        role="group"
        aria-label="Pick a style"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 'var(--space-3)' }}
      >
        {styles.map((s) => {
          const selected = styleSlug === s.slug;
          const tried = triedStyles.has(s.slug);
          return (
            <button
              key={s.slug}
              type="button"
              className="card"
              aria-pressed={selected}
              disabled={busy}
              onClick={() => setStyleSlug(s.slug)}
              style={{
                textAlign: 'left', cursor: 'pointer', padding: 'var(--space-3)',
                border: selected ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
              }}
            >
              {s.imageUrl && (
                <img
                  src={s.imageUrl}
                  alt=""
                  style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 'var(--space-2)', background: 'var(--color-border)' }}
                />
              )}
              <strong>{s.name}</strong>
              {tried && <span className="text-muted" style={{ fontSize: '0.85rem' }}> · tried</span>}
            </button>
          );
        })}
      </div>

      <h3 style={{ marginTop: 'var(--space-4)' }}>Pick a mood</h3>
      <div role="group" aria-label="Pick a mood" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {moods.map((m) => {
          const selected = colorMood === m.value;
          return (
            <button
              key={m.value}
              type="button"
              className={`btn ${selected ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={selected}
              disabled={busy}
              onClick={() => setColorMood(m.value)}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <Button
        onClick={() => styleSlug && colorMood && onSubmit(styleSlug, colorMood)}
        disabled={busy || !styleSlug || !colorMood}
        style={{ marginTop: 'var(--space-4)', width: '100%' }}
      >
        {busy ? 'Styling…' : 'Restyle'}
      </Button>
    </div>
  );
}
