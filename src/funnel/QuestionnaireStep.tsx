import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FunnelLayout } from './FunnelLayout';
import { Button } from '../components/Button';
import { useFunnelState } from './useFunnelState';
import { fetchAppConfig, fetchActiveStyles } from '../firebase/api';
import { DEFAULT_CONFIG } from '../config/defaultConfig';
import type { AppConfig, QuestionDef, QuestionnaireAnswers, Style } from '../domain/types';

/**
 * Funnel step 2: a config-driven questionnaire. The set of questions (and
 * the style gallery's options) come from Firestore (`config/app`, `styles`),
 * falling back to DEFAULT_CONFIG if unseeded, so the flow can change
 * without a redeploy.
 */
export function QuestionnaireStep() {
  const navigate = useNavigate();
  const { answers, mergeAnswers } = useFunnelState();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [fetchedConfig, fetchedStyles] = await Promise.all([
          fetchAppConfig(),
          fetchActiveStyles(),
        ]);
        if (cancelled) return;
        setConfig(fetchedConfig);
        setStyles(fetchedStyles);
      } catch {
        if (cancelled) return;
        // Keep the funnel moving even if the read fails — fall back to the
        // baked-in defaults rather than stranding the customer.
        setConfig(DEFAULT_CONFIG);
        setStyles([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const questions = useMemo<QuestionDef[]>(() => {
    if (!config) return [];
    return config.questionnaire.map((q) => {
      if (q.id !== 'styleSlug') return q;
      return {
        ...q,
        options: styles.map((s) => ({
          value: s.slug,
          label: s.name,
          imageUrl: s.galleryImages[0],
          description: s.description,
        })),
      };
    });
  }, [config, styles]);

  const isComplete = useMemo(() => {
    return questions
      .filter((q) => q.required)
      .every((q) => {
        const value = answers[q.id];
        return typeof value === 'string' && value.trim().length > 0;
      });
  }, [questions, answers]);

  const select = (id: keyof QuestionnaireAnswers, value: string) => {
    mergeAnswers({ [id]: value } as Partial<QuestionnaireAnswers>);
  };

  const handleContinue = () => {
    if (!isComplete) return;
    navigate('/email');
  };

  if (loading) {
    return (
      <FunnelLayout step={2} totalSteps={5}>
        <p role="status">Loading your questionnaire…</p>
      </FunnelLayout>
    );
  }

  return (
    <FunnelLayout step={2} totalSteps={5}>
      <section>
        <h1>Tell us about your space</h1>
        <p>A few quick questions so we can style your room just right.</p>

        {questions.map((q) => (
          <QuestionBlock
            key={q.id}
            question={q}
            value={answers[q.id] ?? ''}
            onSelect={(value) => select(q.id, value)}
          />
        ))}

        <Button
          type="button"
          onClick={handleContinue}
          disabled={!isComplete}
          style={{ marginTop: 'var(--space-5)', width: '100%' }}
        >
          Continue
        </Button>
      </section>
    </FunnelLayout>
  );
}

function QuestionBlock({
  question,
  value,
  onSelect,
}: {
  question: QuestionDef;
  value: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <h2>{question.prompt}</h2>

      {question.type === 'text' && (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onSelect(e.target.value)}
          aria-label={question.prompt}
        />
      )}

      {question.type === 'single' && (
        <div
          role="group"
          aria-label={question.prompt}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
        >
          {(question.options ?? []).map((opt) => {
            const selected = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className={`btn ${selected ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={selected}
                onClick={() => onSelect(opt.value)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {question.type === 'gallery' && (
        <div
          role="group"
          aria-label={question.prompt}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          {(question.options ?? []).map((opt) => {
            const selected = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                className="card"
                aria-pressed={selected}
                onClick={() => onSelect(opt.value)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  padding: 'var(--space-3)',
                  border: selected
                    ? '2px solid var(--color-accent)'
                    : '1px solid var(--color-border)',
                }}
              >
                {opt.imageUrl && (
                  <img
                    src={opt.imageUrl}
                    alt={opt.label}
                    style={{
                      width: '100%',
                      aspectRatio: '4 / 3',
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: 'var(--space-2)',
                      background: 'var(--color-border)',
                    }}
                  />
                )}
                <strong>{opt.label}</strong>
                {opt.description && (
                  <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                    {opt.description}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
