import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { StylesListPage } from './StylesListPage';
import { fetchAllStyles, apiAdminDeleteStyle } from '../firebase/api';
import type { Style } from '../domain/types';

vi.mock('../firebase/api', () => ({
  fetchAllStyles: vi.fn(),
  apiAdminDeleteStyle: vi.fn(),
}));

const mockedFetchAllStyles = vi.mocked(fetchAllStyles);
const mockedApiAdminDeleteStyle = vi.mocked(apiAdminDeleteStyle);

function makeStyle(overrides: Partial<Style>): Style {
  return {
    slug: 'scandinavian',
    name: 'Scandinavian',
    description: 'Light woods, airy neutrals.',
    galleryImages: [],
    recipe: {
      description: 'desc',
      materials: 'oak, linen',
      palette: 'warm neutrals',
      furniture: 'low-profile sofas',
      avoid: 'ornate carving',
    },
    sortOrder: 1,
    active: true,
    ...overrides,
  };
}

const STYLES: Style[] = [
  makeStyle({ slug: 'scandinavian', name: 'Scandinavian', sortOrder: 1, active: true }),
  makeStyle({ slug: 'japandi', name: 'Japandi', sortOrder: 2, active: false }),
];

function renderPage() {
  return render(
    <MemoryRouter>
      <StylesListPage />
    </MemoryRouter>,
  );
}

describe('StylesListPage', () => {
  beforeEach(() => {
    mockedFetchAllStyles.mockReset();
    mockedApiAdminDeleteStyle.mockReset();
    mockedApiAdminDeleteStyle.mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  test('shows a loading state before styles resolve', () => {
    mockedFetchAllStyles.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test('renders rows for each fetched style once loaded', async () => {
    mockedFetchAllStyles.mockResolvedValue(STYLES);

    renderPage();

    await screen.findByText('Scandinavian');
    expect(screen.getByText('Japandi')).toBeInTheDocument();
  });

  test('the "New style" control links to /admin/styles/new', async () => {
    mockedFetchAllStyles.mockResolvedValue(STYLES);

    renderPage();

    await screen.findByText('Scandinavian');

    const newLink = screen.getByRole('link', { name: /new style/i });
    expect(newLink).toHaveAttribute('href', '/admin/styles/new');
  });

  test('each row has an Edit link to /admin/styles/:slug', async () => {
    mockedFetchAllStyles.mockResolvedValue(STYLES);

    renderPage();

    await screen.findByText('Scandinavian');

    const links = screen.getAllByRole('link');
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/admin/styles/scandinavian');
    expect(hrefs).toContain('/admin/styles/japandi');
  });

  test('clicking a row Delete calls apiAdminDeleteStyle with that slug and refetches', async () => {
    mockedFetchAllStyles.mockResolvedValue(STYLES);
    const user = userEvent.setup();

    renderPage();

    await screen.findByText('Scandinavian');
    mockedFetchAllStyles.mockClear();

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    expect(mockedApiAdminDeleteStyle).toHaveBeenCalledWith('scandinavian');
    expect(mockedFetchAllStyles).toHaveBeenCalledTimes(1);
  });
});
