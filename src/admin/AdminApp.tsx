import { Route, Routes } from 'react-router-dom';
import { Button } from '../components/Button';
import { LoginPage } from './LoginPage';
import { useAdminAuth } from './useAdminAuth';

function AdminHome() {
  return <p>Leads coming soon.</p>;
}

/**
 * Guard + shell for the `/admin` area.
 *
 *  - loading  -> a small "checking access" placeholder.
 *  - no user  -> the login form.
 *  - user, but not an admin -> a no-access notice + sign-out (never the
 *    admin tools).
 *  - admin    -> the admin shell with its own routes below.
 *
 * Task 28 adds the leads list at /admin/leads; Task 29 adds the lead
 * detail card at /admin/leads/:id. Both slot into the <Routes> below.
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
          <Route path="/admin" element={<AdminHome />} />
          {/* Task 28: <Route path="/admin/leads" .../> */}
          {/* Task 29: <Route path="/admin/leads/:id" .../> */}
        </Routes>
      </main>
    </div>
  );
}
