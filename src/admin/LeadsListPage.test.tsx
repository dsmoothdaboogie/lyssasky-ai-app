import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LeadsListPage } from './LeadsListPage';
import { fetchAllLeads } from '../firebase/api';
import type { Lead } from '../domain/types';

vi.mock('../firebase/api', () => ({
  fetchAllLeads: vi.fn(),
}));

const mockedFetchAllLeads = vi.mocked(fetchAllLeads);

function makeLead(overrides: Partial<Lead>): Lead {
  return {
    id: 'l1',
    ownerUid: 'u1',
    leadToken: 'tok',
    status: 'captured',
    generatedImagePaths: [],
    costEstimateTotal: 0,
    timestamps: {},
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  };
}

const LEADS: Lead[] = [
  makeLead({
    id: 'lead-booked',
    email: 'booked@example.com',
    status: 'booked',
    answers: {
      roomType: 'living_room',
      styleSlug: 'scandinavian',
      colorMood: 'warm_cozy',
      budget: '1k_5k',
      timeline: 'within_3_months',
    },
    createdAt: 1700000300000,
  }),
  makeLead({
    id: 'lead-captured',
    email: undefined,
    status: 'captured',
    createdAt: 1700000200000,
  }),
  makeLead({
    id: 'lead-failed',
    email: 'failed@example.com',
    status: 'failed',
    createdAt: 1700000100000,
  }),
];

function renderPage() {
  return render(
    <MemoryRouter>
      <LeadsListPage />
    </MemoryRouter>,
  );
}

describe('LeadsListPage', () => {
  beforeEach(() => {
    mockedFetchAllLeads.mockReset();
  });

  test('shows a loading state before leads resolve', () => {
    mockedFetchAllLeads.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test('renders rows for each fetched lead once loaded', async () => {
    mockedFetchAllLeads.mockResolvedValue(LEADS);

    renderPage();

    await screen.findByText('booked@example.com');
    expect(screen.getByText('failed@example.com')).toBeInTheDocument();
    expect(screen.getByText('(no email yet)')).toBeInTheDocument();
    expect(screen.getByText('scandinavian')).toBeInTheDocument();

    const rows = screen.getAllByRole('row').slice(1); // drop header row
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('booked');
    expect(rows[1]).toHaveTextContent('captured');
    expect(rows[2]).toHaveTextContent('failed');
  });

  test('filtering by booked hides non-booked rows', async () => {
    mockedFetchAllLeads.mockResolvedValue(LEADS);
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('booked@example.com');

    await user.selectOptions(screen.getByLabelText(/status/i), 'booked');

    expect(screen.getByText('booked@example.com')).toBeInTheDocument();
    expect(screen.queryByText('failed@example.com')).not.toBeInTheDocument();
    expect(screen.queryByText('(no email yet)')).not.toBeInTheDocument();
  });

  test('each row links to its lead detail page', async () => {
    mockedFetchAllLeads.mockResolvedValue(LEADS);

    renderPage();

    await screen.findByText('booked@example.com');

    const links = screen.getAllByRole('link');
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/admin/leads/lead-booked');
    expect(hrefs).toContain('/admin/leads/lead-captured');
    expect(hrefs).toContain('/admin/leads/lead-failed');
  });

  test('leads render ordered as returned (createdAt desc from the API)', async () => {
    mockedFetchAllLeads.mockResolvedValue(LEADS);

    renderPage();

    await screen.findByText('booked@example.com');

    const rows = screen.getAllByRole('row').slice(1); // drop header row
    expect(rows[0]).toHaveTextContent('booked@example.com');
    expect(rows[1]).toHaveTextContent('(no email yet)');
    expect(rows[2]).toHaveTextContent('failed@example.com');
  });
});
