import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LeadCardPage } from './LeadCardPage';
import { fetchLead, getImageUrl, apiRegenerate, apiAdminMarkPerkRedeemed, apiAdminRestoreRestyle, fetchAllStyles } from '../firebase/api';
import type { Lead } from '../domain/types';

vi.mock('../firebase/api', () => ({
  fetchLead: vi.fn(),
  getImageUrl: vi.fn(),
  apiRegenerate: vi.fn(),
  apiAdminMarkPerkRedeemed: vi.fn().mockResolvedValue({ ok: true }),
  apiAdminRestoreRestyle: vi.fn().mockResolvedValue({ ok: true, restylesUsed: 1 }),
  fetchAllStyles: vi.fn().mockResolvedValue([
    { slug: 'japandi', name: 'Japandi' },
    { slug: 'scandinavian', name: 'Scandinavian' },
  ]),
}));

const mockedFetchLead = vi.mocked(fetchLead);
const mockedGetImageUrl = vi.mocked(getImageUrl);
const mockedApiRegenerate = vi.mocked(apiRegenerate);

const LEAD: Lead = {
  id: 'l1',
  ownerUid: 'u1',
  leadToken: 'tok',
  email: 'jane@example.com',
  status: 'rated',
  answers: {
    roomType: 'living_room',
    styleSlug: 'scandinavian',
    colorMood: 'warm_cozy',
    keep: 'keep my sofa',
    budget: '1k_5k',
    timeline: 'within_3_months',
  },
  originalPhotoPath: 'leads/l1/original.jpg',
  generatedImagePaths: ['leads/l1/generated/1.png', 'leads/l1/generated/2.png'],
  rating: 4,
  feedback: 'Loved it, but wanted more color',
  costEstimateTotal: 0.5,
  timestamps: {
    captured: 1700000000000,
    paid: 1700000100000,
    generated: 1700000200000,
    rated: 1700000300000,
  },
  createdAt: 1700000000000,
  updatedAt: 1700000300000,
};

function renderPage(leadId = 'l1') {
  return render(
    <MemoryRouter initialEntries={[`/admin/leads/${leadId}`]}>
      <Routes>
        <Route path="/admin/leads/:id" element={<LeadCardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LeadCardPage', () => {
  beforeEach(() => {
    mockedFetchLead.mockReset();
    mockedGetImageUrl.mockReset();
    mockedApiRegenerate.mockReset();
    mockedGetImageUrl.mockImplementation(async (path: string) => `https://fake.example/${path}`);
  });

  test('shows a loading state before the lead resolves', () => {
    mockedFetchLead.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test('shows a not-found state when the lead does not exist', async () => {
    mockedFetchLead.mockResolvedValue(undefined);

    renderPage();

    await screen.findByText(/not found/i);
  });

  test('renders answers as human-readable labels, rating, feedback and both image slots', async () => {
    mockedFetchLead.mockResolvedValue(LEAD);

    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'jane@example.com' });

    // Human-readable labels, not raw slugs
    expect(screen.getByText('Living room')).toBeInTheDocument();
    expect(screen.getByText('Warm & cozy')).toBeInTheDocument();
    expect(screen.getByText('$1,000 – $5,000')).toBeInTheDocument();
    expect(screen.getByText('Within 3 months')).toBeInTheDocument();
    expect(screen.getByText('keep my sofa')).toBeInTheDocument();
    expect(screen.getByText(/scandinavian/i)).toBeInTheDocument();

    // Rating + feedback
    expect(screen.getByText(/4\s*\/\s*5/)).toBeInTheDocument();
    expect(screen.getByText('Loved it, but wanted more color')).toBeInTheDocument();

    // Both image slots: original + generated (latest prominent + thumbnails)
    await waitFor(() => {
      expect(mockedGetImageUrl).toHaveBeenCalledWith('leads/l1/original.jpg');
      expect(mockedGetImageUrl).toHaveBeenCalledWith('leads/l1/generated/1.png');
      expect(mockedGetImageUrl).toHaveBeenCalledWith('leads/l1/generated/2.png');
    });

    const images = await screen.findAllByRole('img');
    const srcs = images.map((img) => img.getAttribute('src'));
    expect(srcs).toContain('https://fake.example/leads/l1/original.jpg');
    expect(srcs).toContain('https://fake.example/leads/l1/generated/1.png');
    expect(srcs).toContain('https://fake.example/leads/l1/generated/2.png');
  });

  test('the Re-run generation button calls apiRegenerate with the lead id', async () => {
    mockedFetchLead.mockResolvedValue(LEAD);
    mockedApiRegenerate.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'jane@example.com' });

    await user.click(screen.getByRole('button', { name: /re-run generation/i }));

    expect(mockedApiRegenerate).toHaveBeenCalledWith('l1');
  });
  it('shows pass usage, labeled looks and the perk, and marks it redeemed', async () => {
    const user = userEvent.setup();
    mockedFetchLead.mockResolvedValue({
      ...LEAD,
      pass: { restylesTotal: 5, restylesUsed: 2, expiresAt: Date.UTC(2026, 9, 28) },
      perk: { code: 'ROOM-7KX2', discountPct: 10, validUntil: Date.UTC(2026, 10, 20) },
      looks: [
        { imagePath: 'leads/l1/generated/1.png', styleSlug: 'scandinavian', colorMood: 'warm_cozy', createdAt: 1 },
        { imagePath: 'leads/l1/generated/2.png', styleSlug: 'japandi', colorMood: 'light_airy', createdAt: 2 },
      ],
      booking: { name: 'Jane', interest: 'room_refresh' },
    });
    mockedGetImageUrl.mockResolvedValue('https://img');
    render(
      <MemoryRouter initialEntries={['/admin/leads/l1']}>
        <Routes><Route path="/admin/leads/:id" element={<LeadCardPage />} /></Routes>
      </MemoryRouter>,
    );
    const section = await screen.findByRole('region', { name: 'Room Pass' });
    expect(section).toHaveTextContent('2 of 5 restyles used');
    expect(section).toHaveTextContent('ROOM-7KX2');
    expect(section).toHaveTextContent('10% off');
    expect(await screen.findByText('Japandi · Light & airy')).toBeInTheDocument();
    expect(screen.getByText('Room Refresh (from $650/room, local)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mark perk redeemed' }));
    expect(vi.mocked(apiAdminMarkPerkRedeemed)).toHaveBeenCalledWith('l1');
    expect(await screen.findByText(/Redeemed/)).toBeInTheDocument();
  });

  it('falls back to the slug when styles cannot be fetched', async () => {
    vi.mocked(fetchAllStyles).mockRejectedValueOnce(new Error('nope'));
    mockedFetchLead.mockResolvedValue({
      ...LEAD,
      pass: { restylesTotal: 5, restylesUsed: 2, expiresAt: Date.UTC(2026, 9, 28) },
      looks: [{ imagePath: 'leads/l1/generated/2.png', styleSlug: 'japandi', colorMood: 'light_airy', createdAt: 2 }],
    });
    mockedGetImageUrl.mockResolvedValue('https://img');
    render(
      <MemoryRouter initialEntries={['/admin/leads/l1']}>
        <Routes><Route path="/admin/leads/:id" element={<LeadCardPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('japandi · Light & airy')).toBeInTheDocument();
  });

  it('shows an inline error when marking the perk redeemed fails', async () => {
    const user = userEvent.setup();
    vi.mocked(apiAdminMarkPerkRedeemed).mockRejectedValueOnce(new Error('boom'));
    mockedFetchLead.mockResolvedValue({
      ...LEAD,
      pass: { restylesTotal: 5, restylesUsed: 2, expiresAt: Date.UTC(2026, 9, 28) },
      perk: { code: 'ROOM-7KX2', discountPct: 10, validUntil: Date.UTC(2026, 10, 20) },
    });
    mockedGetImageUrl.mockResolvedValue('https://img');
    render(
      <MemoryRouter initialEntries={['/admin/leads/l1']}>
        <Routes><Route path="/admin/leads/:id" element={<LeadCardPage />} /></Routes>
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole('button', { name: 'Mark perk redeemed' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't mark the perk redeemed — please try again.");
    expect(screen.getByRole('button', { name: 'Mark perk redeemed' })).toBeEnabled();
  });

  const renderCard = () =>
    render(
      <MemoryRouter initialEntries={['/admin/leads/l1']}>
        <Routes><Route path="/admin/leads/:id" element={<LeadCardPage />} /></Routes>
      </MemoryRouter>,
    );

  it('hides "Give back 1 restyle" when no restyles are used', async () => {
    mockedFetchLead.mockResolvedValue({ ...LEAD, pass: { restylesTotal: 5, restylesUsed: 0, expiresAt: Date.UTC(2026, 9, 28) } });
    mockedGetImageUrl.mockResolvedValue('https://img');
    renderCard();
    await screen.findByRole('region', { name: 'Room Pass' });
    expect(screen.queryByRole('button', { name: 'Give back 1 restyle' })).not.toBeInTheDocument();
  });

  it('hides "Give back 1 restyle" when the pass has expired', async () => {
    mockedFetchLead.mockResolvedValue({ ...LEAD, pass: { restylesTotal: 5, restylesUsed: 2, expiresAt: Date.UTC(2020, 0, 1) } });
    mockedGetImageUrl.mockResolvedValue('https://img');
    renderCard();
    await screen.findByRole('region', { name: 'Room Pass' });
    expect(screen.queryByRole('button', { name: 'Give back 1 restyle' })).not.toBeInTheDocument();
  });

  it('gives back a restyle and updates the count in place', async () => {
    const user = userEvent.setup();
    vi.mocked(apiAdminRestoreRestyle).mockResolvedValueOnce({ ok: true, restylesUsed: 1 });
    mockedFetchLead.mockResolvedValue({ ...LEAD, pass: { restylesTotal: 5, restylesUsed: 2, expiresAt: Date.UTC(2026, 9, 28), inFlight: 123 } });
    mockedGetImageUrl.mockResolvedValue('https://img');
    renderCard();
    await user.click(await screen.findByRole('button', { name: 'Give back 1 restyle' }));
    expect(vi.mocked(apiAdminRestoreRestyle)).toHaveBeenCalledWith('l1');
    const section = screen.getByRole('region', { name: 'Room Pass' });
    await waitFor(() => expect(section).toHaveTextContent('1 of 5 restyles used'));
    expect(screen.getByRole('button', { name: 'Give back 1 restyle' })).toBeEnabled();
  });

  it('hides the button once the count reaches zero', async () => {
    const user = userEvent.setup();
    vi.mocked(apiAdminRestoreRestyle).mockResolvedValueOnce({ ok: true, restylesUsed: 0 });
    mockedFetchLead.mockResolvedValue({ ...LEAD, pass: { restylesTotal: 5, restylesUsed: 1, expiresAt: Date.UTC(2026, 9, 28) } });
    mockedGetImageUrl.mockResolvedValue('https://img');
    renderCard();
    await user.click(await screen.findByRole('button', { name: 'Give back 1 restyle' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Give back 1 restyle' })).not.toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Room Pass' })).toHaveTextContent('0 of 5 restyles used');
  });

  it('shows an inline error when giving back a restyle fails', async () => {
    const user = userEvent.setup();
    vi.mocked(apiAdminRestoreRestyle).mockRejectedValueOnce(new Error('boom'));
    mockedFetchLead.mockResolvedValue({ ...LEAD, pass: { restylesTotal: 5, restylesUsed: 2, expiresAt: Date.UTC(2026, 9, 28) } });
    mockedGetImageUrl.mockResolvedValue('https://img');
    renderCard();
    await user.click(await screen.findByRole('button', { name: 'Give back 1 restyle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't give back the restyle — please try again.");
    expect(screen.getByRole('region', { name: 'Room Pass' })).toHaveTextContent('2 of 5 restyles used');
  });
});
