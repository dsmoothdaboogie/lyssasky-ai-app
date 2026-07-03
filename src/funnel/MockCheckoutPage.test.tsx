import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FunnelProvider } from './useFunnelState';
import { MockCheckoutPage } from './MockCheckoutPage';
import { apiConfirmPaymentMock, apiLogEvent } from '../firebase/api';

vi.mock('../firebase/api', () => ({
  apiConfirmPaymentMock: vi.fn().mockResolvedValue({ ok: true }),
  apiLogEvent: vi.fn().mockResolvedValue({ ok: true }),
}));

function renderMockCheckout(initialEntry = '/mock-checkout?lead=l1&session=mock_l1') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FunnelProvider>
        <Routes>
          <Route path="/mock-checkout" element={<MockCheckoutPage />} />
          <Route path="/wait" element={<WaitProbe />} />
          <Route path="/email" element={<EmailProbe />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </FunnelProvider>
    </MemoryRouter>
  );
}

function WaitProbe() {
  return <div>wait-screen</div>;
}

function EmailProbe() {
  return <div>email-screen</div>;
}

describe('MockCheckoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiConfirmPaymentMock as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    (apiLogEvent as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  });

  it('shows a mock checkout summary', async () => {
    renderMockCheckout();
    expect(await screen.findByText(/\$5/)).toBeInTheDocument();
    expect(screen.getByText(/mock|test/i)).toBeInTheDocument();
  });

  it('simulate success calls apiConfirmPaymentMock and navigates to /wait with the lead', async () => {
    const user = userEvent.setup();
    renderMockCheckout();

    await user.click(screen.getByRole('button', { name: /simulate success/i }));

    await waitFor(() =>
      expect(apiConfirmPaymentMock).toHaveBeenCalledWith('l1', 'mock_l1')
    );
    expect(await screen.findByText('wait-screen')).toBeInTheDocument();
  });

  it('simulate cancel navigates back to /email with a gentle message', async () => {
    const user = userEvent.setup();
    renderMockCheckout();

    await user.click(screen.getByRole('button', { name: /simulate cancel/i }));

    expect(apiConfirmPaymentMock).not.toHaveBeenCalled();
    expect(await screen.findByText('email-screen')).toBeInTheDocument();
  });

  it('shows a friendly fallback when lead/session are missing from the query', async () => {
    renderMockCheckout('/mock-checkout');

    expect(await screen.findByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start over|home/i })).toHaveAttribute('href', '/');
  });
});
