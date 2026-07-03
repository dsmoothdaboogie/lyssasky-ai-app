import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LeadCardPage } from './LeadCardPage';
import { fetchLead, getImageUrl, apiRegenerate } from '../firebase/api';
import type { Lead } from '../domain/types';

vi.mock('../firebase/api', () => ({
  fetchLead: vi.fn(),
  getImageUrl: vi.fn(),
  apiRegenerate: vi.fn(),
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
});
