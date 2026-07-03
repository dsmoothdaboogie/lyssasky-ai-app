import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router-dom';
import { FunnelProvider } from './useFunnelState';
import { WaitScreen } from './WaitScreen';
import { watchLead, apiRegenerate } from '../firebase/api';
import { ensureAnonymousAuth } from '../firebase/client';
import type { Lead } from '../domain/types';

vi.mock('../firebase/api', () => ({
  watchLead: vi.fn(),
  apiRegenerate: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('../firebase/client', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue('u1'),
}));

function makeLead(overrides: Partial<Lead>): Lead {
  return {
    id: 'l1',
    ownerUid: 'u1',
    leadToken: 'tok',
    status: 'paid',
    generatedImagePaths: [],
    costEstimateTotal: 0,
    timestamps: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function ResultProbe() {
  const [params] = useSearchParams();
  return <div>result-screen:{params.get('lead')}</div>;
}

function renderWaitScreen(initialEntry = '/wait?lead=l1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FunnelProvider>
        <Routes>
          <Route path="/wait" element={<WaitScreen />} />
          <Route path="/result" element={<ResultProbe />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </FunnelProvider>
    </MemoryRouter>
  );
}

describe('WaitScreen', () => {
  let unsub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    unsub = vi.fn();
    (ensureAnonymousAuth as ReturnType<typeof vi.fn>).mockResolvedValue('u1');
    (apiRegenerate as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    (watchLead as ReturnType<typeof vi.fn>).mockImplementation(() => unsub);
  });

  it('shows a warm waiting state while status is paid', async () => {
    renderWaitScreen();

    await waitFor(() => expect(watchLead).toHaveBeenCalled());

    expect(
      screen.getAllByText(/styling your room|getting your room ready|20.?30 seconds/i).length
    ).toBeGreaterThan(0);
  });

  it('calls ensureAnonymousAuth before subscribing with watchLead', async () => {
    renderWaitScreen();

    await waitFor(() => expect(watchLead).toHaveBeenCalledWith('l1', expect.any(Function)));
    expect(ensureAnonymousAuth).toHaveBeenCalled();
  });

  it('navigates to /result with the lead id when status becomes generated', async () => {
    renderWaitScreen();

    await waitFor(() => expect(watchLead).toHaveBeenCalledWith('l1', expect.any(Function)));
    const cb = (watchLead as ReturnType<typeof vi.fn>).mock.calls[0][1];

    act(() => {
      cb(makeLead({ status: 'generated', generatedImagePaths: ['leads/u1/out1.png'] }));
    });

    expect(await screen.findByText('result-screen:l1')).toBeInTheDocument();
  });

  it('shows a warm apology and a Try again control when status becomes failed', async () => {
    renderWaitScreen();

    await waitFor(() => expect(watchLead).toHaveBeenCalledWith('l1', expect.any(Function)));
    const cb = (watchLead as ReturnType<typeof vi.fn>).mock.calls[0][1];

    act(() => {
      cb(makeLead({ status: 'failed' }));
    });

    expect(
      await screen.findByText(/didn't go quite right|email your finished design/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('retrying calls apiRegenerate and returns to the waiting state', async () => {
    const user = userEvent.setup();
    renderWaitScreen();

    await waitFor(() => expect(watchLead).toHaveBeenCalledWith('l1', expect.any(Function)));
    const cb = (watchLead as ReturnType<typeof vi.fn>).mock.calls[0][1];
    act(() => {
      cb(makeLead({ status: 'failed' }));
    });

    await screen.findByRole('button', { name: /try again/i });
    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => expect(apiRegenerate).toHaveBeenCalledWith('l1'));
    await waitFor(() =>
      expect(
        screen.getAllByText(/styling your room|getting your room ready|20.?30 seconds/i).length
      ).toBeGreaterThan(0)
    );
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = renderWaitScreen();

    await waitFor(() => expect(watchLead).toHaveBeenCalled());
    unmount();

    expect(unsub).toHaveBeenCalled();
  });

  it('shows a friendly start-over link when no lead id can be resolved', async () => {
    renderWaitScreen('/wait');

    expect(await screen.findByRole('link', { name: /start over|home/i })).toHaveAttribute(
      'href',
      '/'
    );
    expect(watchLead).not.toHaveBeenCalled();
  });
});
