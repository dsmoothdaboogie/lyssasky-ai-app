import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FunnelProvider } from './useFunnelState';
import { QuestionnaireStep } from './QuestionnaireStep';
import { fetchAppConfig, fetchActiveStyles } from '../firebase/api';
import { DEFAULT_CONFIG } from '../config/defaultConfig';
import type { Style } from '../domain/types';

const FAKE_STYLES: Style[] = [
  {
    slug: 'scandinavian',
    name: 'Scandinavian',
    description: 'Light woods, soft neutrals, cozy minimalism.',
    galleryImages: ['https://example.com/scandi.jpg'],
    recipe: {
      description: '', materials: '', palette: '', furniture: '', avoid: '',
    },
    sortOrder: 1,
    active: true,
  },
  {
    slug: 'japandi',
    name: 'Japandi',
    description: 'Japanese minimalism meets Scandinavian warmth.',
    galleryImages: ['https://example.com/japandi.jpg'],
    recipe: {
      description: '', materials: '', palette: '', furniture: '', avoid: '',
    },
    sortOrder: 2,
    active: true,
  },
];

vi.mock('../firebase/api', () => ({
  fetchAppConfig: vi.fn(),
  fetchActiveStyles: vi.fn(),
}));

function renderQuestionnaire() {
  return render(
    <MemoryRouter initialEntries={['/questionnaire']}>
      <FunnelProvider>
        <Routes>
          <Route path="/questionnaire" element={<QuestionnaireStep />} />
          <Route path="/email" element={<p>Email screen</p>} />
        </Routes>
      </FunnelProvider>
    </MemoryRouter>
  );
}

describe('QuestionnaireStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetchAppConfig as ReturnType<typeof vi.fn>).mockResolvedValue(DEFAULT_CONFIG);
    (fetchActiveStyles as ReturnType<typeof vi.fn>).mockResolvedValue(FAKE_STYLES);
  });

  it('renders all six question prompts', async () => {
    renderQuestionnaire();

    for (const q of DEFAULT_CONFIG.questionnaire) {
      expect(await screen.findByText(q.prompt)).toBeInTheDocument();
    }
  });

  it('populates the style gallery from the fetched styles', async () => {
    renderQuestionnaire();

    expect(await screen.findByText('Scandinavian')).toBeInTheDocument();
    expect(screen.getByText('Japandi')).toBeInTheDocument();
    expect(screen.getByText(/Light woods, soft neutrals/)).toBeInTheDocument();
  });

  it('blocks Continue until all required questions are answered, then enables it', async () => {
    const user = userEvent.setup();
    renderQuestionnaire();

    await screen.findByText('Scandinavian');

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    expect(continueBtn).toBeDisabled();

    await user.click(screen.getByText('Living room'));
    expect(continueBtn).toBeDisabled();

    await user.click(screen.getByText('Scandinavian'));
    expect(continueBtn).toBeDisabled();

    await user.click(screen.getByText('Warm & cozy'));
    expect(continueBtn).toBeDisabled();

    await user.click(screen.getByText('$1,000 – $5,000'));
    expect(continueBtn).toBeDisabled();

    await user.click(screen.getByText('Within 3 months'));

    await waitFor(() => expect(continueBtn).not.toBeDisabled());

    // "keep" is optional and should not block Continue.
    await user.click(continueBtn);
    await waitFor(() => expect(screen.getByText('Email screen')).toBeInTheDocument());
  });
});
