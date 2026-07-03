import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FunnelProvider, useFunnelState } from './useFunnelState';
import { EmailStep } from './EmailStep';
import { apiUpdateLeadAnswers, apiStartCheckout } from '../firebase/api';
import { redirectTo } from './redirect';
import type { QuestionnaireAnswers } from '../domain/types';

const FAKE_ANSWERS: QuestionnaireAnswers = {
  roomType: 'living_room',
  styleSlug: 'scandinavian',
  colorMood: 'warm_cozy',
  budget: '1k_5k',
  timeline: 'within_3_months',
};

const CHECKOUT_URL = 'http://localhost:5173/mock-checkout?lead=l1&session=mock_l1';

vi.mock('../firebase/api', () => ({
  apiUpdateLeadAnswers: vi.fn().mockResolvedValue({ ok: true }),
  apiStartCheckout: vi.fn().mockResolvedValue({
    checkoutUrl: 'http://localhost:5173/mock-checkout?lead=l1&session=mock_l1',
  }),
}));

vi.mock('./redirect', () => ({
  redirectTo: vi.fn(),
}));

/** Seeds funnel state with a leadId + complete answers before rendering children. */
function Seed({ children }: { children: React.ReactNode }) {
  const { leadId, setLeadId, mergeAnswers } = useFunnelState();

  useEffect(() => {
    setLeadId('l1');
    mergeAnswers(FAKE_ANSWERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (leadId !== 'l1') return null;
  return <>{children}</>;
}

function renderEmailStep() {
  return render(
    <MemoryRouter initialEntries={['/email']}>
      <FunnelProvider>
        <Routes>
          <Route
            path="/email"
            element={
              <Seed>
                <EmailStep />
              </Seed>
            }
          />
        </Routes>
      </FunnelProvider>
    </MemoryRouter>
  );
}

describe('EmailStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiUpdateLeadAnswers as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    (apiStartCheckout as ReturnType<typeof vi.fn>).mockResolvedValue({ checkoutUrl: CHECKOUT_URL });
  });

  it('shows a friendly error for an invalid email and does not call the API', async () => {
    const user = userEvent.setup();
    renderEmailStep();

    const input = await screen.findByLabelText(/email/i);
    await user.type(input, 'not-an-email');
    await user.click(screen.getByRole('button', { name: /continue|send|get my design/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i);
    expect(apiUpdateLeadAnswers).not.toHaveBeenCalled();
    expect(apiStartCheckout).not.toHaveBeenCalled();
    expect(redirectTo).not.toHaveBeenCalled();
  });

  it('submits a valid email, persists it, starts checkout, and redirects', async () => {
    const user = userEvent.setup();
    renderEmailStep();

    const input = await screen.findByLabelText(/email/i);
    await user.type(input, 'customer@example.com');
    await user.click(screen.getByRole('button', { name: /continue|send|get my design/i }));

    await waitFor(() =>
      expect(apiUpdateLeadAnswers).toHaveBeenCalledWith('l1', FAKE_ANSWERS, 'customer@example.com')
    );
    await waitFor(() => expect(apiStartCheckout).toHaveBeenCalledWith('l1'));
    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith(CHECKOUT_URL));
  });
});
