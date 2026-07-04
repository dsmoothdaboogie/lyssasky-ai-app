import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { FunnelProvider } from './useFunnelState';
import { ResultStep } from './ResultStep';
import { fetchLead, getImageUrl, apiSubmitFeedback, apiRegenerate, apiGetResultByToken } from '../firebase/api';
import { ensureAnonymousAuth } from '../firebase/client';
import type { Lead } from '../domain/types';

vi.mock('../firebase/api', () => ({
  fetchLead: vi.fn(),
  getImageUrl: vi.fn(),
  apiSubmitFeedback: vi.fn().mockResolvedValue({ ok: true }),
  apiRegenerate: vi.fn().mockResolvedValue({ ok: true }),
  apiGetResultByToken: vi.fn(),
}));

vi.mock('../firebase/client', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue('u1'),
}));

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    ownerUid: 'u1',
    leadToken: 'tok',
    status: 'generated',
    originalPhotoPath: 'leads/u1/original.jpg',
    generatedImagePaths: ['leads/u1/generated/1.png'],
    costEstimateTotal: 0,
    timestamps: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function BookProbe() {
  const [params] = useSearchParams();
  return <div>book-screen:{params.get('lead')}</div>;
}

function WaitProbe() {
  const [params] = useSearchParams();
  return <div>wait-screen:{params.get('lead')}</div>;
}

function renderResultStep(initialEntry = '/result?lead=l1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FunnelProvider>
        <Routes>
          <Route path="/result" element={<ResultStep />} />
          <Route path="/book" element={<BookProbe />} />
          <Route path="/wait" element={<WaitProbe />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </FunnelProvider>
    </MemoryRouter>
  );
}

describe('ResultStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ensureAnonymousAuth as ReturnType<typeof vi.fn>).mockResolvedValue('u1');
    (fetchLead as ReturnType<typeof vi.fn>).mockResolvedValue(makeLead());
    (getImageUrl as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) =>
      `https://example.test/${path}`
    );
    (apiSubmitFeedback as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    (apiRegenerate as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
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
    await user.type(
      screen.getByLabelText(/what would you change/i),
      'A bit more color please'
    );
    await user.click(screen.getByRole('button', { name: /continue|submit/i }));

    await waitFor(() =>
      expect(apiSubmitFeedback).toHaveBeenCalledWith('l1', 4, 'A bit more color please')
    );
    expect(await screen.findByText('book-screen:l1')).toBeInTheDocument();
  });

  it('disables submit until a rating is chosen', async () => {
    renderResultStep();
    await screen.findByAltText(/your new room|generated|after/i);

    expect(screen.getByRole('button', { name: /continue|submit/i })).toBeDisabled();
  });

  it('"Try another version" calls apiRegenerate and navigates to /wait', async () => {
    const user = userEvent.setup();
    renderResultStep();

    await screen.findByAltText(/your new room|generated|after/i);

    await user.click(screen.getByRole('button', { name: /try another version/i }));

    await waitFor(() => expect(apiRegenerate).toHaveBeenCalledWith('l1'));
    expect(await screen.findByText('wait-screen:l1')).toBeInTheDocument();
  });

  it('marks the regenerate as used (hiding it) even if apiRegenerate fails, without navigating away', async () => {
    (apiRegenerate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nope'));
    const user = userEvent.setup();
    renderResultStep();

    await screen.findByAltText(/your new room|generated|after/i);
    await user.click(screen.getByRole('button', { name: /try another version/i }));

    await waitFor(() => expect(apiRegenerate).toHaveBeenCalledWith('l1'));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /try another version/i })
      ).not.toBeInTheDocument()
    );
    expect(screen.queryByText('wait-screen:l1')).not.toBeInTheDocument();
  });

  it('token mode: with ?lead= and ?token= both present, loads via apiGetResultByToken (not fetchLead) using the already-resolved URL', async () => {
    (apiGetResultByToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'generated',
      imageUrls: ['http://x/img.png'],
    });

    renderResultStep('/result?lead=l1&token=t1');

    await waitFor(() =>
      expect(apiGetResultByToken).toHaveBeenCalledWith('l1', 't1')
    );
    expect(fetchLead).not.toHaveBeenCalled();
    // Token mode renders the URL apiGetResultByToken already resolved
    // server-side — it must NOT be re-resolved with getImageUrl (the client
    // Storage SDK), since a fresh cross-device uid can't do that resolution
    // itself.
    expect(getImageUrl).not.toHaveBeenCalled();

    const img = await screen.findByAltText(/your new room|generated|after/i);
    expect(img).toHaveAttribute('src', 'http://x/img.png');

    // The rating/regenerate controls are owner-guarded server-side, so the
    // read-only emailed-link view hides them rather than showing controls
    // that would just fail.
    expect(
      screen.queryByRole('group', { name: /how close is this to your vision/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /try another version/i })
    ).not.toBeInTheDocument();
  });
});
