import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AnalyticsPage } from './AnalyticsPage';
import { apiAdminGetAnalytics } from '../firebase/api';
import type { AnalyticsSummary } from '../domain/types';

vi.mock('../firebase/api', () => ({
  apiAdminGetAnalytics: vi.fn(),
}));

const mockedApiAdminGetAnalytics = vi.mocked(apiAdminGetAnalytics);

const FIXTURE: AnalyticsSummary = {
  funnel: { captured: 10, paid: 6, generated: 5, rated: 4, booked: 2, failed: 1 },
  totalLeads: 10,
  stylePopularity: [{ slug: 'modern-farmhouse', count: 7 }],
  avgRatingByStyle: [{ slug: 'modern-farmhouse', avg: 2.5, count: 4 }],
  budgetDistribution: { under_5k: 3, '5k_15k': 9 },
  timelineDistribution: { asap: 8, '3_6_months': 11 },
  revenueCents: 1500,
  generations: { total: 5, failed: 1, avgDurationMs: 4200, estCostCents: 320 },
  pass: { paidPasses: 6, avgRestylesUsed: 2.5, perksRedeemed: 1, perkRedemptionRate: 1 / 6 },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AnalyticsPage />
    </MemoryRouter>,
  );
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    mockedApiAdminGetAnalytics.mockReset();
  });

  test('shows a loading state before data arrives', () => {
    mockedApiAdminGetAnalytics.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText(/loading analytics/i)).toBeInTheDocument();
  });

  test('renders funnel counts, revenue, style popularity, and a low-rating flag', async () => {
    mockedApiAdminGetAnalytics.mockResolvedValue(FIXTURE);

    renderPage();

    const funnel = within(await screen.findByRole('region', { name: /funnel/i }));
    expect(funnel.getByLabelText('Captured: 10')).toBeInTheDocument();
    expect(funnel.getByLabelText('Paid: 6')).toBeInTheDocument();
    expect(funnel.getByLabelText('Generated: 5')).toBeInTheDocument();
    expect(funnel.getByLabelText('Rated: 4')).toBeInTheDocument();
    expect(funnel.getByLabelText('Booked: 2')).toBeInTheDocument();
    expect(funnel.getByLabelText('Failed: 1')).toBeInTheDocument();

    // Revenue formatted from cents
    const revenue = within(screen.getByRole('region', { name: /revenue/i }));
    expect(revenue.getByLabelText('Revenue: $15.00')).toBeInTheDocument();

    // Style popularity bar/label
    const styles = within(screen.getByRole('region', { name: /style popularity/i }));
    expect(styles.getByText(/modern-farmhouse/i)).toBeInTheDocument();
    expect(styles.getByText('7')).toBeInTheDocument();

    // Low-rating flag for avg 2.5
    const ratings = within(screen.getByRole('region', { name: /average rating/i }));
    expect(ratings.getByText(/recipe needs test-bench work/i)).toBeInTheDocument();
  });

  test('shows an error state when the load fails', async () => {
    mockedApiAdminGetAnalytics.mockRejectedValue(new Error('nope'));

    renderPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
  test('shows Room Pass metrics', async () => {
    mockedApiAdminGetAnalytics.mockResolvedValue(FIXTURE);
    renderPage();
    const section = await screen.findByRole('region', { name: 'Room Pass' });
    expect(within(section).getByText('6')).toBeInTheDocument(); // paid passes
    expect(within(section).getByText('2.5')).toBeInTheDocument(); // avg restyles
    expect(within(section).getByText('17%')).toBeInTheDocument(); // 1/6 redemption
  });
});
