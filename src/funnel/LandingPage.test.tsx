import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FunnelProvider } from './useFunnelState';
import { LandingPage } from './LandingPage';
import { apiLogEvent } from '../firebase/api';

vi.mock('../firebase/api', () => ({
  apiLogEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <FunnelProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/upload" element={<p>Upload screen</p>} />
        </Routes>
      </FunnelProvider>
    </MemoryRouter>
  );
}

describe('LandingPage', () => {
  it('renders the headline', () => {
    renderLanding();
    expect(screen.getByRole('heading', { name: /see your room, restyled/i })).toBeInTheDocument();
  });

  it('mentions the $5 price', () => {
    renderLanding();
    expect(screen.getAllByText(/\$5/).length).toBeGreaterThan(0);
  });

  it('shows reassuring "no pressure, no judgment" microcopy', () => {
    renderLanding();
    expect(screen.getByText(/no pressure, no judgment/i)).toBeInTheDocument();
  });

  it('logs a page_view event on mount', () => {
    renderLanding();
    expect(apiLogEvent).toHaveBeenCalledWith('page_view');
  });

  it('navigates to /upload when the CTA is clicked', async () => {
    const user = userEvent.setup();
    renderLanding();
    await user.click(screen.getByRole('button', { name: /see your room, restyled — \$5/i }));
    expect(screen.getByText('Upload screen')).toBeInTheDocument();
  });
});
