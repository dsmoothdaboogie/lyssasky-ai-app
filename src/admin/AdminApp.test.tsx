import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminApp } from './AdminApp';
import { useAdminAuth } from './useAdminAuth';
import type { UseAdminAuth } from './useAdminAuth';

vi.mock('./useAdminAuth', () => ({
  useAdminAuth: vi.fn(),
}));

vi.mock('../firebase/api', () => ({
  fetchAllLeads: vi.fn().mockResolvedValue([]),
}));

const mockedUseAdminAuth = vi.mocked(useAdminAuth);

function mockAuth(overrides: Partial<UseAdminAuth>) {
  mockedUseAdminAuth.mockReturnValue({
    user: null,
    isAdmin: false,
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  });
}

function renderAdminApp(initialEntry = '/admin') {
  // Mirrors production (App.tsx mounts AdminApp at path="/admin/*"): the
  // nested <Routes> inside AdminApp match against the pathname with that
  // prefix stripped, so it must be nested the same way here for the
  // routing (in particular the "/admin" -> "/admin/leads" redirect) to be
  // exercised faithfully.
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminApp', () => {
  test('shows a checking-access state while auth is loading', () => {
    mockAuth({ loading: true });

    renderAdminApp();

    expect(screen.getByText(/checking access/i)).toBeInTheDocument();
  });

  test('renders the login form when no user is signed in', () => {
    mockAuth({ user: null });

    renderAdminApp();

    expect(screen.getByRole('heading', { name: /admin sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^leads$/i })).not.toBeInTheDocument();
  });

  test('shows a no-access notice (not the tools) for a signed-in non-admin user', () => {
    mockAuth({ user: { uid: 'u1' } as never, isAdmin: false });

    renderAdminApp();

    expect(screen.getByText(/don't have admin access/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /admin sign in/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^leads$/i })).not.toBeInTheDocument();
  });

  test('renders the protected admin content for a signed-in admin (redirected to the leads list)', async () => {
    mockAuth({ user: { uid: 'u1' } as never, isAdmin: true });

    renderAdminApp();

    expect(await screen.findByRole('heading', { name: /leads/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /admin sign in/i })).not.toBeInTheDocument();
  });
});
