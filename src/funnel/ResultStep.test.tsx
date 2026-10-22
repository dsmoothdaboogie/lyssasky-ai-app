import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { FunnelProvider } from './useFunnelState';
import { ResultStep } from './ResultStep';
import { fetchLead, getImageUrl, apiSubmitFeedback, apiRestyle, apiGetResultByToken } from '../firebase/api';
import { ensureAnonymousAuth } from '../firebase/client';
import type { Lead } from '../domain/types';

vi.mock('../firebase/api', () => ({
  fetchLead: vi.fn(),
  getImageUrl: vi.fn(),
  apiSubmitFeedback: vi.fn().mockResolvedValue({ ok: true }),
  apiRestyle: vi.fn(),
  apiGetResultByToken: vi.fn(),
  fetchActiveStyles: vi.fn().mockResolvedValue([
    { slug: 'scandi', name: 'Scandinavian', galleryImages: [], active: true, sortOrder: 0, description: '', recipe: {} },
    { slug: 'japandi', name: 'Japandi', galleryImages: [], active: true, sortOrder: 1, description: '', recipe: {} },
  ]),
  fetchAppConfig: vi.fn(async () => (await import('../config/defaultConfig')).DEFAULT_CONFIG),
}));

vi.mock('../firebase/client', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue('u1'),
}));

const NOW = Date.UTC(2026, 9, 21, 16);
function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'l1', ownerUid: 'u1', leadToken: 'tok', status: 'generated',
    originalPhotoPath: 'leads/u1/original.jpg',
    generatedImagePaths: ['leads/u1/generated/1.png'],
    looks: [{ imagePath: 'leads/u1/generated/1.png', styleSlug: 'scandi', colorMood: 'warm_cozy', createdAt: 1 }],
    pass: { restylesTotal: 5, restylesUsed: 1, expiresAt: Date.UTC(2026, 9, 28, 16) },
    perk: { code: 'ROOM-7KX2', discountPct: 10, validUntil: Date.UTC(2026, 10, 20, 16) },
    costEstimateTotal: 0, timestamps: {}, createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

function BookProbe() {
  const [params] = useSearchParams();
  return <div>book-screen:{params.get('lead')}</div>;
}

function renderResultStep(initialEntry = '/result?lead=l1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FunnelProvider>
        <Routes>
          <Route path="/result" element={<ResultStep />} />
          <Route path="/book" element={<BookProbe />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </FunnelProvider>
    </MemoryRouter>
  );
}

describe('ResultStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureAnonymousAuth).mockResolvedValue('u1');
    vi.mocked(fetchLead).mockResolvedValue(makeLead());
    vi.mocked(getImageUrl).mockImplementation(async (path: string) => `https://example.test/${path}`);
    vi.mocked(apiSubmitFeedback).mockResolvedValue({ ok: true });
  });

  it('resolves and renders the newest generated image', async () => {
    renderResultStep();

    await waitFor(() => expect(ensureAnonymousAuth).toHaveBeenCalled());
    await waitFor(() => expect(fetchLead).toHaveBeenCalledWith('l1'));

    const img = await screen.findByAltText(/your new room|generated|after/i);
    expect(img).toHaveAttribute('src', 'https://example.test/leads/u1/generated/1.png');
  });

  it('selecting a rating and submitting calls apiSubmitFeedback and navigates to /book', async () => {
    const user = userEvent.setup();
    renderResultStep();

    await screen.findByAltText(/your new room|generated|after/i);

    await user.click(screen.getByRole('button', { name: '4' }));
    await user.type(screen.getByLabelText(/what would you change/i), 'A bit more color please');
    await user.click(screen.getByRole('button', { name: /continue|submit/i }));

    await waitFor(() => expect(apiSubmitFeedback).toHaveBeenCalledWith('l1', 4, 'A bit more color please'));
    expect(await screen.findByText('book-screen:l1')).toBeInTheDocument();
  });

  it('disables submit until a rating is chosen', async () => {
    renderResultStep();
    await screen.findByAltText(/your new room|generated|after/i);

    expect(screen.getByRole('button', { name: /continue|submit/i })).toBeDisabled();
  });

  it('shows the current look label, pass status, and the Marjorie card', async () => {
    vi.mocked(fetchLead).mockResolvedValue(makeLead());
    vi.mocked(getImageUrl).mockResolvedValue('https://img/1');
    renderResultStep();
    expect(await screen.findByText('Scandinavian · Warm & cozy')).toBeInTheDocument();
    expect(screen.getByText('4 restyles left · ends Oct 28')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Book your free 15-min chat/ })).toHaveAttribute('href', '/book?lead=l1');
    expect(screen.getByText(/ROOM-7KX2/)).toBeInTheDocument();
    expect(screen.getByText(/10% off Virtual Styling \(from \$250\) or Room Refresh \(from \$650\)/)).toBeInTheDocument();
  });

  it('uses the singular when one restyle is left', async () => {
    vi.mocked(fetchLead).mockResolvedValue(makeLead({
      pass: { restylesTotal: 5, restylesUsed: 4, expiresAt: Date.UTC(2026, 9, 28, 16) },
    }));
    renderResultStep();
    expect(await screen.findByText('1 restyle left · ends Oct 28')).toBeInTheDocument();
  });

  it('restyles inline and shows the new look as current', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const after = makeLead({
      generatedImagePaths: ['leads/u1/generated/1.png', 'leads/u1/generated/2.png'],
      looks: [
        { imagePath: 'leads/u1/generated/1.png', styleSlug: 'scandi', colorMood: 'warm_cozy', createdAt: 1 },
        { imagePath: 'leads/u1/generated/2.png', styleSlug: 'japandi', colorMood: 'light_airy', createdAt: 2 },
      ],
      pass: { restylesTotal: 5, restylesUsed: 2, expiresAt: Date.UTC(2026, 9, 28, 16) },
    });
    vi.mocked(fetchLead).mockResolvedValueOnce(makeLead()).mockResolvedValueOnce(after);
    vi.mocked(getImageUrl).mockImplementation(async (p) => `https://img/${p}`);
    let resolve!: (v: { imagePath: string; restylesLeft: number }) => void;
    vi.mocked(apiRestyle).mockReturnValue(new Promise((r) => { resolve = r; }));
    renderResultStep();

    await user.click(await screen.findByRole('button', { name: 'Try another look' }));
    await user.click(await screen.findByRole('button', { name: /Japandi/ }));
    await user.click(screen.getByRole('button', { name: 'Light & airy' }));
    await user.click(screen.getByRole('button', { name: 'Restyle' }));

    expect(screen.getByRole('status')).toHaveTextContent('Styling your new look…');
    expect(apiRestyle).toHaveBeenCalledWith('l1', 'japandi', 'light_airy');
    resolve({ imagePath: 'leads/u1/generated/2.png', restylesLeft: 3 });

    expect(await screen.findByText('Japandi · Light & airy')).toBeInTheDocument();
    expect(screen.getByText('3 restyles left · ends Oct 28')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Look \d/ })).toHaveLength(2);
  });

  it('switches the current look from the strip', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(fetchLead).mockResolvedValue(makeLead({
      generatedImagePaths: ['a', 'b'],
      looks: [
        { imagePath: 'a', styleSlug: 'scandi', colorMood: 'warm_cozy', createdAt: 1 },
        { imagePath: 'b', styleSlug: 'japandi', colorMood: 'light_airy', createdAt: 2 },
      ],
    }));
    vi.mocked(getImageUrl).mockImplementation(async (p) => `https://img/${p}`);
    renderResultStep();
    expect(await screen.findByText('Japandi · Light & airy')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Look 1: Scandinavian · Warm & cozy' }));
    expect(screen.getByText('Scandinavian · Warm & cozy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Look 1: Scandinavian · Warm & cozy' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the callable error inline and keeps the picker open', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(fetchLead).mockResolvedValue(makeLead());
    vi.mocked(getImageUrl).mockResolvedValue('https://img/1');
    vi.mocked(apiRestyle).mockRejectedValue(Object.assign(new Error("We couldn't create that look — your restyle wasn't used. Please try again."), { code: 'functions/internal' }));
    renderResultStep();
    await user.click(await screen.findByRole('button', { name: 'Try another look' }));
    await user.click(await screen.findByRole('button', { name: /Japandi/ }));
    await user.click(screen.getByRole('button', { name: 'Warm & cozy' }));
    await user.click(screen.getByRole('button', { name: 'Restyle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("your restyle wasn't used");
    expect(screen.getByRole('button', { name: 'Restyle' })).toBeInTheDocument();
  });

  it.each([
    ['exhausted', { pass: { restylesTotal: 5, restylesUsed: 5, expiresAt: Date.UTC(2026, 9, 28) } }],
    ['expired', { pass: { restylesTotal: 5, restylesUsed: 1, expiresAt: Date.UTC(2026, 9, 21, 15) } }],
  ])('a %s pass routes to Marjorie instead of restyling', async (_label, overrides) => {
    vi.mocked(fetchLead).mockResolvedValue(makeLead(overrides as Partial<Lead>));
    vi.mocked(getImageUrl).mockResolvedValue('https://img/1');
    renderResultStep();
    expect(await screen.findByText(/You've explored 1 look — next step: talk them through with Marjorie/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try another look' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a new Room Pass' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /Book your free 15-min chat/ })).toBeInTheDocument();
  });

  it('an exhausted but unexpired pass says no restyles left with the end date', async () => {
    vi.mocked(fetchLead).mockResolvedValue(makeLead({
      pass: { restylesTotal: 5, restylesUsed: 5, expiresAt: Date.UTC(2026, 9, 28, 16) },
    }));
    renderResultStep();
    expect(await screen.findByText('No restyles left · ends Oct 28')).toBeInTheDocument();
    expect(screen.queryByText('Room Pass ended')).not.toBeInTheDocument();
  });

  it('an expired pass says the Room Pass ended', async () => {
    vi.mocked(fetchLead).mockResolvedValue(makeLead({
      pass: { restylesTotal: 5, restylesUsed: 1, expiresAt: Date.UTC(2026, 9, 21, 15) },
    }));
    renderResultStep();
    expect(await screen.findByText('Room Pass ended')).toBeInTheDocument();
  });

  it('asks for a rating only once (not after rating)', async () => {
    vi.mocked(fetchLead).mockResolvedValue(makeLead({ status: 'rated' }));
    vi.mocked(getImageUrl).mockResolvedValue('https://img/1');
    renderResultStep();
    await screen.findByText('Scandinavian · Warm & cozy');
    expect(screen.queryByRole('group', { name: 'How close is this to your vision?' })).not.toBeInTheDocument();
  });

  it('token mode loads via apiGetResultByToken, shows looks and perk but no restyle or rating', async () => {
    vi.mocked(apiGetResultByToken).mockResolvedValue({
      status: 'generated', imageUrls: ['https://img/a', 'https://img/b'],
      looks: [
        { url: 'https://img/a', styleSlug: 'scandi', colorMood: 'warm_cozy' },
        { url: 'https://img/b', styleSlug: 'japandi', colorMood: 'light_airy' },
      ],
      pass: { restylesTotal: 5, restylesUsed: 1, expiresAt: Date.UTC(2026, 9, 1) },
      perk: { code: 'ROOM-7KX2', discountPct: 10, validUntil: Date.UTC(2026, 10, 20) },
    });
    renderResultStep('/result?lead=l1&token=tok');
    expect(await screen.findByText('Japandi · Light & airy')).toBeInTheDocument();
    expect(apiGetResultByToken).toHaveBeenCalledWith('l1', 'tok');
    expect(fetchLead).not.toHaveBeenCalled();
    expect(getImageUrl).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: /^Look \d/ })).toHaveLength(2);
    expect(screen.getByText(/ROOM-7KX2/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try another look' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'How close is this to your vision?' })).not.toBeInTheDocument();
  });

  it('token mode with no looks falls back to imageUrls', async () => {
    vi.mocked(apiGetResultByToken).mockResolvedValue({
      status: 'generated', imageUrls: ['http://x/img.png'], looks: [], pass: null, perk: null,
    });
    renderResultStep('/result?lead=l1&token=t1');
    const img = await screen.findByAltText(/your new room|generated|after/i);
    expect(img).toHaveAttribute('src', 'http://x/img.png');
  });

  it('legacy lead without a pass shows no pass UI', async () => {
    vi.mocked(fetchLead).mockResolvedValue(makeLead({ pass: undefined, perk: undefined, looks: undefined }));
    vi.mocked(getImageUrl).mockResolvedValue('https://img/1');
    renderResultStep();
    await screen.findByRole('heading', { name: 'Your new room, reimagined' });
    expect(screen.queryByText(/restyles left/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try another look' })).not.toBeInTheDocument();
    expect(screen.queryByText(/ROOM-/)).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'How close is this to your vision?' })).toBeInTheDocument();
  });
});
