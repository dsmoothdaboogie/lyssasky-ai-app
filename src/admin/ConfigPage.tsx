import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button } from '../components/Button';
import { apiAdminUpdateConfig, fetchAppConfig } from '../firebase/api';
import type { AppConfig, QuestionDef, QuestionOption } from '../domain/types';

const GENERIC_ERROR = 'Something went wrong saving the config — please try again.';

interface FlagRow {
  key: string;
  value: boolean;
}

function flagsToRows(flags: Record<string, boolean>): FlagRow[] {
  return Object.entries(flags).map(([key, value]) => ({ key, value }));
}

function rowsToFlags(rows: FlagRow[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key === '') continue;
    out[key] = row.value;
  }
  return out;
}

/**
 * Admin editor for the singleton `config/app` doc, at `/admin/config`.
 *
 * Price is edited in dollars for readability and converted to integer cents
 * on save (AppConfig.priceCents is the source of truth). The questionnaire
 * editor lets admins tweak prompts/required/options in place; reordering or
 * adding/removing whole questions is out of scope (types.ts pins `id` to
 * QuestionnaireAnswers keys, so the question set itself is fixed).
 */
export function ConfigPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [priceDollars, setPriceDollars] = useState('0');
  const [currency, setCurrency] = useState('');
  const [calendlyUrl, setCalendlyUrl] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [paymentMode, setPaymentMode] = useState<AppConfig['paymentMode']>('mock');
  const [generationMode, setGenerationMode] = useState<AppConfig['generationMode']>('mock');
  const [passRestyles, setPassRestyles] = useState('5');
  const [passDays, setPassDays] = useState('7');
  const [perkDiscountPct, setPerkDiscountPct] = useState('10');
  const [perkDays, setPerkDays] = useState('30');
  const [flagRows, setFlagRows] = useState<FlagRow[]>([]);
  const [questionnaire, setQuestionnaire] = useState<QuestionDef[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAppConfig()
      .then((config) => {
        if (cancelled) return;
        setPriceDollars((config.priceCents / 100).toString());
        setCurrency(config.currency);
        setCalendlyUrl(config.calendlyUrl);
        setNotifyEmail(config.notifyEmail);
        setPaymentMode(config.paymentMode);
        setGenerationMode(config.generationMode);
        setPassRestyles(String(config.passRestyles));
        setPassDays(String(config.passDays));
        setPerkDiscountPct(String(config.perkDiscountPct));
        setPerkDays(String(config.perkDays));
        setFlagRows(flagsToRows(config.featureFlags));
        setQuestionnaire(config.questionnaire);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : GENERIC_ERROR);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddFlag = () => {
    setFlagRows((rows) => [...rows, { key: '', value: false }]);
  };

  const handleRemoveFlag = (index: number) => {
    setFlagRows((rows) => rows.filter((_, i) => i !== index));
  };

  const handleFlagKeyChange = (index: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setFlagRows((rows) => rows.map((r, i) => (i === index ? { ...r, key } : r)));
  };

  const handleFlagValueChange = (index: number) => (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.checked;
    setFlagRows((rows) => rows.map((r, i) => (i === index ? { ...r, value } : r)));
  };

  const updateQuestion = (index: number, patch: Partial<QuestionDef>) => {
    setQuestionnaire((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };

  const handleAddOption = (qIndex: number) => {
    setQuestionnaire((qs) =>
      qs.map((q, i) =>
        i === qIndex ? { ...q, options: [...(q.options ?? []), { value: '', label: '' }] } : q,
      ),
    );
  };

  const handleRemoveOption = (qIndex: number, optIndex: number) => {
    setQuestionnaire((qs) =>
      qs.map((q, i) =>
        i === qIndex ? { ...q, options: (q.options ?? []).filter((_, oi) => oi !== optIndex) } : q,
      ),
    );
  };

  const updateOption = (qIndex: number, optIndex: number, patch: Partial<QuestionOption>) => {
    setQuestionnaire((qs) =>
      qs.map((q, i) =>
        i === qIndex
          ? {
              ...q,
              options: (q.options ?? []).map((o, oi) => (oi === optIndex ? { ...o, ...patch } : o)),
            }
          : q,
      ),
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    const parsedDollars = Number.parseFloat(priceDollars);
    const priceCents = Number.isFinite(parsedDollars) ? Math.round(parsedDollars * 100) : 0;
    const patch: Partial<AppConfig> = {
      priceCents,
      currency: currency.trim(),
      calendlyUrl: calendlyUrl.trim(),
      notifyEmail: notifyEmail.trim(),
      paymentMode,
      generationMode,
      passRestyles: Number.parseInt(passRestyles, 10),
      passDays: Number.parseInt(passDays, 10),
      perkDiscountPct: Number.parseInt(perkDiscountPct, 10),
      perkDays: Number.parseInt(perkDays, 10),
      featureFlags: rowsToFlags(flagRows),
      questionnaire,
    };
    try {
      await apiAdminUpdateConfig(patch);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : GENERIC_ERROR);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-shell admin-shell-centered">
        <p role="status">Loading config…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="admin-shell admin-shell-centered">
        <p role="alert">{loadError}</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Config</h1>

      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <section className="card admin-form-section">
          <h2>General</h2>

          <div className="admin-form-field">
            <label htmlFor="config-price">Price (dollars)</label>
            <input
              id="config-price"
              type="number"
              step="0.01"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
            />
          </div>

          <div className="admin-form-field">
            <label htmlFor="config-currency">Currency</label>
            <input
              id="config-currency"
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>

          <div className="admin-form-field">
            <label htmlFor="config-calendly-url">Calendly URL</label>
            <input
              id="config-calendly-url"
              type="text"
              value={calendlyUrl}
              onChange={(e) => setCalendlyUrl(e.target.value)}
            />
          </div>

          <div className="admin-form-field">
            <label htmlFor="config-notify-email">Notify email</label>
            <input
              id="config-notify-email"
              type="text"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
            />
          </div>

          <div className="admin-form-field">
            <label htmlFor="config-payment-mode">Payment mode</label>
            <select
              id="config-payment-mode"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as AppConfig['paymentMode'])}
            >
              <option value="mock">mock</option>
              <option value="stripe">stripe</option>
            </select>
          </div>

          <div className="admin-form-field">
            <label htmlFor="config-generation-mode">Generation mode</label>
            <select
              id="config-generation-mode"
              value={generationMode}
              onChange={(e) => setGenerationMode(e.target.value as AppConfig['generationMode'])}
            >
              <option value="mock">mock</option>
              <option value="gemini">gemini</option>
            </select>
          </div>
        </section>

        <section className="card admin-form-section">
          <h2>Room Pass</h2>
          <p className="text-muted">Applies to new passes only — existing passes keep what they paid for.</p>
          {[
            ['config-pass-restyles', 'Restyles per pass', passRestyles, setPassRestyles],
            ['config-pass-days', 'Pass length (days)', passDays, setPassDays],
            ['config-perk-pct', 'Perk discount (%)', perkDiscountPct, setPerkDiscountPct],
            ['config-perk-days', 'Perk valid for (days)', perkDays, setPerkDays],
          ].map(([id, label, value, set]) => (
            <div className="admin-form-field" key={id as string}>
              <label htmlFor={id as string}>{label as string}</label>
              <input
                id={id as string}
                type="number"
                step="1"
                min="0"
                value={value as string}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
              />
            </div>
          ))}
        </section>

        <section className="card admin-form-section">
          <h2>Feature flags</h2>

          {flagRows.length === 0 ? (
            <p className="text-muted">No feature flags yet.</p>
          ) : (
            <ul className="admin-flag-list">
              {flagRows.map((row, index) => (
                <li key={index} className="admin-flag-row">
                  <input
                    aria-label={`Feature flag ${index + 1} key`}
                    type="text"
                    value={row.key}
                    onChange={handleFlagKeyChange(index)}
                    placeholder="flag_key"
                  />
                  <label>
                    <input
                      aria-label={`Feature flag ${index + 1} value`}
                      type="checkbox"
                      checked={row.value}
                      onChange={handleFlagValueChange(index)}
                    />
                    Enabled
                  </label>
                  <Button variant="secondary" onClick={() => handleRemoveFlag(index)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Button type="button" variant="secondary" onClick={handleAddFlag}>
            Add feature flag
          </Button>
        </section>

        <section className="card admin-form-section">
          <h2>Questionnaire</h2>

          {questionnaire.map((q, qIndex) => (
            <div key={q.id} className="admin-question-block">
              <h3>{q.id}</h3>

              <div className="admin-form-field">
                <label htmlFor={`question-${qIndex}-prompt`}>Prompt</label>
                <input
                  id={`question-${qIndex}-prompt`}
                  type="text"
                  value={q.prompt}
                  onChange={(e) => updateQuestion(qIndex, { prompt: e.target.value })}
                />
              </div>

              <div className="admin-form-field">
                <label htmlFor={`question-${qIndex}-type`}>Type</label>
                <select
                  id={`question-${qIndex}-type`}
                  value={q.type}
                  onChange={(e) =>
                    updateQuestion(qIndex, { type: e.target.value as QuestionDef['type'] })
                  }
                >
                  <option value="single">single</option>
                  <option value="gallery">gallery</option>
                  <option value="text">text</option>
                </select>
              </div>

              <div className="admin-form-field admin-form-field-checkbox">
                <label htmlFor={`question-${qIndex}-required`}>
                  <input
                    id={`question-${qIndex}-required`}
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(qIndex, { required: e.target.checked })}
                  />
                  Required
                </label>
              </div>

              {q.options !== undefined && (
                <div className="admin-options-block">
                  <h4>Options</h4>
                  {q.options.length === 0 ? (
                    <p className="text-muted">No options yet.</p>
                  ) : (
                    <ul className="admin-option-list">
                      {q.options.map((opt, optIndex) => (
                        <li key={optIndex} className="admin-option-row">
                          <input
                            aria-label={`${q.id} option ${optIndex + 1} value`}
                            type="text"
                            value={opt.value}
                            onChange={(e) =>
                              updateOption(qIndex, optIndex, { value: e.target.value })
                            }
                            placeholder="value"
                          />
                          <input
                            aria-label={`${q.id} option ${optIndex + 1} label`}
                            type="text"
                            value={opt.label}
                            onChange={(e) =>
                              updateOption(qIndex, optIndex, { label: e.target.value })
                            }
                            placeholder="label"
                          />
                          <Button
                            variant="secondary"
                            onClick={() => handleRemoveOption(qIndex, optIndex)}
                          >
                            Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button type="button" variant="secondary" onClick={() => handleAddOption(qIndex)}>
                    Add option
                  </Button>
                </div>
              )}
            </div>
          ))}
        </section>

        {saveError && <p role="alert">{saveError}</p>}
        {saved && !saveError && <p role="status">Saved.</p>}

        <div className="admin-form-actions">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save config'}
          </Button>
        </div>
      </form>
    </div>
  );
}
