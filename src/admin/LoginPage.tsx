import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button } from '../components/Button';
import { useAdminAuth } from './useAdminAuth';

const GENERIC_ERROR = "That email and password combination didn't work — please try again.";

/**
 * Email/password sign-in for the `/admin` area. Rendered by AdminApp
 * whenever there's no signed-in user; a signed-in-but-non-admin user
 * gets a different (no-access) view, not this form.
 */
export function LoginPage() {
  const { signIn } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="admin-shell admin-shell-centered">
      <div className="card admin-login-card">
        <h1>Admin sign in</h1>
        <p className="text-muted">Sign in with your admin email and password.</p>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            disabled={isSubmitting}
          />

          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            disabled={isSubmitting}
          />

          {error && (
            <p role="alert" style={{ marginTop: 'var(--space-2)' }}>
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            style={{ marginTop: 'var(--space-5)', width: '100%' }}
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
