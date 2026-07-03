import { render, screen } from '@testing-library/react';
import { FunnelLayout } from './FunnelLayout';

describe('FunnelLayout', () => {
  it('renders its children', () => {
    render(
      <FunnelLayout>
        <p>Hello funnel</p>
      </FunnelLayout>
    );
    expect(screen.getByText('Hello funnel')).toBeInTheDocument();
  });

  it('renders the Lyssasky wordmark', () => {
    render(
      <FunnelLayout>
        <p>content</p>
      </FunnelLayout>
    );
    expect(screen.getByText(/lyssasky/i)).toBeInTheDocument();
  });

  it('does not render a progress indicator when step/totalSteps are omitted', () => {
    render(
      <FunnelLayout>
        <p>content</p>
      </FunnelLayout>
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders a progress indicator when given step and totalSteps', () => {
    render(
      <FunnelLayout step={2} totalSteps={4}>
        <p>content</p>
      </FunnelLayout>
    );
    const progress = screen.getByRole('progressbar');
    expect(progress).toBeInTheDocument();
    expect(progress).toHaveAttribute('aria-valuenow', '2');
    expect(progress).toHaveAttribute('aria-valuemax', '4');
  });
});
