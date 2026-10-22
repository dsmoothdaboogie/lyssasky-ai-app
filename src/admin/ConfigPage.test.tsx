import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ConfigPage } from './ConfigPage';
import { fetchAppConfig, apiAdminUpdateConfig } from '../firebase/api';
import { DEFAULT_CONFIG } from '../config/defaultConfig';

vi.mock('../firebase/api', () => ({
  fetchAppConfig: vi.fn(),
  apiAdminUpdateConfig: vi.fn(),
}));

const mockedFetchAppConfig = vi.mocked(fetchAppConfig);
const mockedApiAdminUpdateConfig = vi.mocked(apiAdminUpdateConfig);

function renderPage() {
  return render(
    <MemoryRouter>
      <ConfigPage />
    </MemoryRouter>,
  );
}

describe('ConfigPage', () => {
  beforeEach(() => {
    mockedFetchAppConfig.mockReset();
    mockedApiAdminUpdateConfig.mockReset();
    mockedFetchAppConfig.mockResolvedValue(DEFAULT_CONFIG);
    mockedApiAdminUpdateConfig.mockResolvedValue({ ok: true });
  });

  test('loads config and renders questionnaire prompts', async () => {
    renderPage();

    for (const q of DEFAULT_CONFIG.questionnaire) {
      expect(await screen.findByDisplayValue(q.prompt)).toBeInTheDocument();
    }
  });

  test('changing price and generationMode and saving calls apiAdminUpdateConfig with converted patch', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByDisplayValue(DEFAULT_CONFIG.questionnaire[0].prompt);

    const priceInput = screen.getByLabelText(/price/i);
    await user.clear(priceInput);
    await user.type(priceInput, '7');

    const generationModeSelect = screen.getByLabelText(/generation mode/i);
    await user.selectOptions(generationModeSelect, 'gemini');

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(mockedApiAdminUpdateConfig).toHaveBeenCalledTimes(1));
    const patch = mockedApiAdminUpdateConfig.mock.calls[0][0];
    expect(patch.priceCents).toBe(700);
    expect(patch.generationMode).toBe('gemini');

    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });

  test('shows an error message when saving fails', async () => {
    mockedApiAdminUpdateConfig.mockRejectedValue(new Error('nope'));
    const user = userEvent.setup();
    renderPage();

    await screen.findByDisplayValue(DEFAULT_CONFIG.questionnaire[0].prompt);
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  test('edits Room Pass settings and saves them as integers', async () => {
    const user = userEvent.setup();
    renderPage();

    const restyles = await screen.findByLabelText('Restyles per pass');
    expect(restyles).toHaveValue(5);
    expect(screen.getByLabelText('Pass length (days)')).toHaveValue(7);
    expect(screen.getByLabelText('Perk discount (%)')).toHaveValue(10);
    expect(screen.getByLabelText('Perk valid for (days)')).toHaveValue(30);

    await user.clear(restyles);
    await user.type(restyles, '3');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(mockedApiAdminUpdateConfig).toHaveBeenCalledTimes(1));
    expect(mockedApiAdminUpdateConfig.mock.calls[0][0]).toMatchObject({
      passRestyles: 3,
      passDays: 7,
      perkDiscountPct: 10,
      perkDays: 30,
    });
  });
});
