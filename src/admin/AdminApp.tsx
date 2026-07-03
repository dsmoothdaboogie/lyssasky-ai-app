import { Navigate, Route, Routes } from 'react-router-dom';
import { Button } from '../components/Button';
import { LoginPage } from './LoginPage';
import { LeadsListPage } from './LeadsListPage';
import { LeadCardPage } from './LeadCardPage';
import { useAdminAuth } from './useAdminAuth';

/**
 * Guard + shell for the `/admin` area.
 *
 *  - loading  -> a small "checking access" placeholder.
 *  - no user  -> the login form.
 *  - user, but not an admin -> a no-access notice + sign-out (never the
 *    admin tools).
 *  - admin    -> the admin shell with its own routes below.
 *
 * `/admin` redirects straight to the leads list; `/admin/leads/:id` opens
 * the pre-consult briefing card for a single lead.
 */
export function AdminApp() {
  const { user, isAdmin, loading, signOut } = useAdminAuth();

  if (loading) {
    return (
      <div className="admin-shell admin-shell-centered">
        <p role="status">Checking access…</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (!isAdmin) {
    return (
      <div className="admin-shell admin-shell-centered">
        <div className="card admin-login-card">
          <p role="alert">You don't have admin access.</p>
          <Button onClick={() => void signOut()} variant="secondary">
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <span className="funnel-wordmark">Lyssasky Admin</span>
        <Button onClick={() => void signOut()} variant="secondary">
          Sign out
        </Button>
      </header>
      <main className="admin-main">
        <Routes>
          <Route path="/admin" element={<Navigate to="/admin/leads" replace />} />
          <Route path="/admin/leads" element={<LeadsListPage />} />
          <Route path="/admin/leads/:id" element={<LeadCardPage />} />
        </Routes>
      </main>
    </div>
  );
}
