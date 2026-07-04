import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FunnelProvider } from './useFunnelState';
import { BookingStep } from './BookingStep';
import { apiSubmitBooking, fetchAppConfig, apiLogEvent } from '../firebase/api';
import { ensureAnonymousAuth } from '../firebase/client';
import { DEFAULT_CONFIG } from '../config/defaultConfig';

const CALENDLY_URL = 'https://calendly.com/lyssasky/consult';

vi.mock('../firebase/api', () => ({
  apiSubmitBooking: vi.fn().mockResolvedValue({ ok: true }),
  fetchAppConfig: vi.fn().mockResolvedValue({
    priceCents: 500,
    currency: 'CAD',
    calendlyUrl: 'https://calendly.com/lyssasky/consult',
    paymentMode: 'mock',
    generationMode: 'mock',
    notifyEmail: 'marjorie@lyssasky.com',
    featureFlags: {},
    questionnaire: [],
  }),
  apiLogEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('../firebase/client', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue('u1'),
}));

function renderBookingStep() {
  return render(
    <MemoryRouter initialEntries={['/book?lead=l1']}>
      <FunnelProvider>
        <BookingStep />
      </FunnelProvider>
    </MemoryRouter>
  );
}

describe('BookingStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiSubmitBooking as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    (fetchAppConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...DEFAULT_CONFIG,
      calendlyUrl: CALENDLY_URL,
    });
    (ensureAnonymousAuth as ReturnType<typeof vi.fn>).mockResolvedValue('u1');
    (apiLogEvent as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  });

  it('submits the lead form and calls apiSubmitBooking with the entered name', async () => {
    const user = userEvent.setup();
    renderBookingStep();

    const nameInput = await screen.findByLabelText(/name/i);
    await user.type(nameInput, 'Jamie Rivera');
    await user.click(screen.getByRole('button', { name: /book|submit|schedule|confirm/i }));

    await waitFor(() =>
      expect(apiSubmitBooking).toHaveBeenCalledWith(
        'l1',
        expect.objectContaining({ name: 'Jamie Rivera' })
      )
    );
    expect(ensureAnonymousAuth).toHaveBeenCalled();
    expect(await screen.findByText(/all set/i)).toBeInTheDocument();
  });

  it('blocks submission when name is empty', async () => {
    const user = userEvent.setup();
    renderBookingStep();

    await screen.findByLabelText(/name/i);
    await user.click(screen.getByRole('button', { name: /book|submit|schedule|confirm/i }));

    expect(apiSubmitBooking).not.toHaveBeenCalled();
  });

  it('renders the Calendly iframe with the URL from config', async () => {
    renderBookingStep();

    const iframe = await screen.findByTitle(/book with marjorie/i);
    await waitFor(() => expect(iframe).toHaveAttribute('src', CALENDLY_URL));
  });
});
