import type { ReactNode } from 'react';

export interface FunnelLayoutProps {
  children: ReactNode;
  /** 1-indexed current step, e.g. 2 of 4. */
  step?: number;
  totalSteps?: number;
}

/**
 * Branded shell for every funnel screen: wordmark header, an optional
 * step progress indicator, and a centered, mobile-first column for content.
 */
export function FunnelLayout({ children, step, totalSteps }: FunnelLayoutProps) {
  const showProgress = typeof step === 'number' && typeof totalSteps === 'number' && totalSteps > 0;

  return (
    <div className="funnel-shell">
      <header className="funnel-header">
        <span className="funnel-wordmark">Lyssasky</span>
        {showProgress && (
          <div
            className="funnel-progress"
            role="progressbar"
            aria-valuenow={step}
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-label={`Step ${step} of ${totalSteps}`}
          >
            {Array.from({ length: totalSteps! }).map((_, i) => (
              <span
                key={i}
                className={`funnel-progress-dot${i < step! ? ' is-complete' : ''}`}
              />
            ))}
          </div>
        )}
      </header>
      <main className="funnel-main">{children}</main>
    </div>
  );
}
