import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FunnelProvider } from './useFunnelState';
import { BookingStep } from './BookingStep';
import { apiSubmitBooking, fetchAppConfig, apiLogEvent, fetchLead, apiGetResultByToken } from '../firebase/api';
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
  fetchLead: vi.fn(),
  apiGetResultByToken: vi.fn(),
}));

vi.mock('../firebase/client', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue('u1'),
}));

function renderBookingStep(entry = '/book?lead=l1') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
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
    vi.mocked(fetchLead).mockResolvedValue(undefined);
  });

  it('shows the all-set state instead of the form when the lead is already booked', async () => {
    vi.mocked(fetchLead).mockResolvedValue({ id: 'l1', status: 'booked' } as never);
    renderBookingStep();
    expect(await screen.findByText(/You're all set — Marjorie will be in touch/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Book my consultation' })).not.toBeInTheDocument();
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

  it('shows the perk code and sends the chosen interest', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLead).mockResolvedValue({
      id: 'l1', ownerUid: 'u1', leadToken: 't', status: 'rated', generatedImagePaths: [],
      costEstimateTotal: 0, timestamps: {}, createdAt: 0, updatedAt: 0,
      perk: { code: 'ROOM-7KX2', discountPct: 10, validUntil: Date.now() + 86_400_000 },
    } as never);
    renderBookingStep();
    expect(await screen.findByText(/ROOM-7KX2/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Name'), 'Jane');
    await user.selectOptions(screen.getByLabelText("I'm interested in"), 'virtual_styling');
    await user.click(screen.getByRole('button', { name: 'Book my consultation' }));
    await waitFor(() => expect(apiSubmitBooking).toHaveBeenCalledWith('l1', { name: 'Jane', interest: 'virtual_styling' }));
  });

  it('defaults interest to the free chat', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLead).mockResolvedValue(undefined);
    renderBookingStep();
    await user.type(screen.getByLabelText('Name'), 'Jane');
    await user.click(screen.getByRole('button', { name: 'Book my consultation' }));
    await waitFor(() => expect(apiSubmitBooking).toHaveBeenCalledWith('l1', { name: 'Jane', interest: 'chat' }));
  });

  describe('with an emailed ?token', () => {
    const tokenResult = (overrides = {}) => ({
      status: 'generated', imageUrls: [], looks: [], pass: null,
      perk: { code: 'ROOM-7KX2', discountPct: 10, validUntil: Date.now() + 86_400_000 },
      ...overrides,
    });

    it('reads perk via apiGetResultByToken (not fetchLead) and books with the token', async () => {
      const user = userEvent.setup();
      vi.mocked(apiGetResultByToken).mockResolvedValue(tokenResult() as never);
      renderBookingStep('/book?lead=l1&token=tok');
      expect(await screen.findByText(/ROOM-7KX2/)).toBeInTheDocument();
      expect(apiGetResultByToken).toHaveBeenCalledWith('l1', 'tok');
      expect(fetchLead).not.toHaveBeenCalled();

      await user.type(screen.getByLabelText('Name'), 'Jane');
      await user.click(screen.getByRole('button', { name: 'Book my consultation' }));
      await waitFor(() => expect(apiSubmitBooking).toHaveBeenCalledWith('l1', { name: 'Jane', interest: 'chat' }, 'tok'));
      expect(await screen.findByText(/You're all set/)).toBeInTheDocument();
    });

    it('shows the all-set state when the token read says booked', async () => {
      vi.mocked(apiGetResultByToken).mockResolvedValue(tokenResult({ status: 'booked', perk: null }) as never);
      renderBookingStep('/book?lead=l1&token=tok');
      expect(await screen.findByText(/You're all set — Marjorie will be in touch/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Book my consultation' })).not.toBeInTheDocument();
    });
  });
});
