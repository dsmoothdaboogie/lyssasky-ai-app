import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import { useAdminAuth } from './useAdminAuth';
import type { UseAdminAuth } from './useAdminAuth';

vi.mock('./useAdminAuth', () => ({
  useAdminAuth: vi.fn(),
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

test('calls signIn with the entered email and password on submit', async () => {
  const signIn = vi.fn().mockResolvedValue(undefined);
  mockAuth({ signIn });

  const user = userEvent.setup();
  render(<LoginPage />);

  await user.type(screen.getByLabelText(/email/i), 'admin@lyssasky.test');
  await user.type(screen.getByLabelText(/password/i), 'password');
  await user.click(screen.getByRole('button', { name: /sign in/i }));

  expect(signIn).toHaveBeenCalledWith('admin@lyssasky.test', 'password');
});

test('shows a friendly error when sign-in fails', async () => {
  const signIn = vi.fn().mockRejectedValue(new Error('auth/wrong-password'));
  mockAuth({ signIn });

  const user = userEvent.setup();
  render(<LoginPage />);

  await user.type(screen.getByLabelText(/email/i), 'admin@lyssasky.test');
  await user.type(screen.getByLabelText(/password/i), 'wrong-password');
  await user.click(screen.getByRole('button', { name: /sign in/i }));

  expect(await screen.findByRole('alert')).toBeInTheDocument();
});
