import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { QuestionnaireAnswers } from '../domain/types';

export interface FunnelState {
  leadId: string | null;
  uid: string | null;
  answers: Partial<QuestionnaireAnswers>;
  email: string | null;
  originalPhotoPreviewUrl: string | null;
  regenerateUsed: boolean;
  setLeadId(id: string | null): void;
  setUid(uid: string | null): void;
  mergeAnswers(patch: Partial<QuestionnaireAnswers>): void;
  setEmail(email: string | null): void;
  setOriginalPhotoPreviewUrl(url: string | null): void;
  setRegenerateUsed(used: boolean): void;
  reset(): void;
}

const FunnelStateContext = createContext<FunnelState | null>(null);

/**
 * Holds funnel-wide state in memory for the lifetime of the app (not
 * persisted to storage). Wrap the app in this once, near the root.
 */
export function FunnelProvider({ children }: { children: ReactNode }) {
  const [leadId, setLeadId] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Partial<QuestionnaireAnswers>>({});
  const [email, setEmail] = useState<string | null>(null);
  const [originalPhotoPreviewUrl, setOriginalPhotoPreviewUrl] = useState<string | null>(null);
  const [regenerateUsed, setRegenerateUsed] = useState(false);

  const mergeAnswers = useCallback((patch: Partial<QuestionnaireAnswers>) => {
    setAnswers((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setLeadId(null);
    setUid(null);
    setAnswers({});
    setEmail(null);
    setOriginalPhotoPreviewUrl(null);
    setRegenerateUsed(false);
  }, []);

  const value = useMemo<FunnelState>(
    () => ({
      leadId,
      uid,
      answers,
      email,
      originalPhotoPreviewUrl,
      regenerateUsed,
      setLeadId,
      setUid,
      mergeAnswers,
      setEmail,
      setOriginalPhotoPreviewUrl,
      setRegenerateUsed,
      reset,
    }),
    [leadId, uid, answers, email, originalPhotoPreviewUrl, regenerateUsed, mergeAnswers, reset]
  );

  return createElement(FunnelStateContext.Provider, { value }, children);
}

export function useFunnelState(): FunnelState {
  const ctx = useContext(FunnelStateContext);
  if (!ctx) {
    throw new Error('useFunnelState must be used within a FunnelProvider');
  }
  return ctx;
}
