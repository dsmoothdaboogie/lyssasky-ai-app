import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FunnelProvider } from './useFunnelState';
import { LandingPage } from './LandingPage';
import { apiLogEvent, fetchAppConfig } from '../firebase/api';
import { DEFAULT_CONFIG } from '../config/defaultConfig';

vi.mock('../firebase/api', () => ({
  apiLogEvent: vi.fn().mockResolvedValue({ ok: true }),
  fetchAppConfig: vi.fn(),
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
  beforeEach(() => {
    (fetchAppConfig as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_CONFIG);
  });

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
    await user.click(screen.getByRole('button', { name: /get your room pass — \$5/i }));
    expect(screen.getByText('Upload screen')).toBeInTheDocument();
  });

  it('renders today\'s exact copy at the default config', async () => {
    renderLanding();
    const intro = screen.getByText(/Upload one photo of your space/);
    expect(intro.textContent?.replace(/\s+/g, ' ')).toBe(
      'Upload one photo of your space and get a $5 Room Pass: see your room in up to 6 looks over 7 days, plus a free chat with Marjorie and 10% off her services. It\'s a first look — a gentle "here\'s what\'s possible," not a finished redesign.'
    );
    expect(screen.getByRole('button', { name: 'Get your Room Pass — $5' })).toBeInTheDocument();
  });

  it('follows non-default pass settings', async () => {
    (fetchAppConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_CONFIG, priceCents: 900, passRestyles: 3, passDays: 10, perkDiscountPct: 15,
    });
    renderLanding();
    expect(await screen.findByRole('button', { name: 'Get your Room Pass — $9' })).toBeInTheDocument();
    const intro = screen.getByText(/Upload one photo of your space/);
    expect(intro.textContent).toContain('$9 Room Pass');
    expect(intro.textContent).toContain('up to 4 looks over 10 days');
    expect(intro.textContent).toContain('15% off her services');
  });

  it('uses singular "1 look" when the pass has no extra restyles', async () => {
    (fetchAppConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ ...DEFAULT_CONFIG, passRestyles: 0 });
    renderLanding();
    await screen.findByRole('button', { name: 'Get your Room Pass — $5' });
    const intro = screen.getByText(/Upload one photo of your space/);
    expect(intro.textContent).toContain('in 1 look over 7 days');
  });

  it('keeps plural looks for 2 total', async () => {
    (fetchAppConfig as ReturnType<typeof vi.fn>).mockResolvedValue({ ...DEFAULT_CONFIG, passRestyles: 1 });
    renderLanding();
    await waitFor(() => expect(screen.getByText(/Upload one photo of your space/).textContent).toContain('up to 2 looks over'));
  });

  it('keeps default copy when the config fetch fails', async () => {
    (fetchAppConfig as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    renderLanding();
    expect(await screen.findByRole('button', { name: 'Get your Room Pass — $5' })).toBeInTheDocument();
  });
});
