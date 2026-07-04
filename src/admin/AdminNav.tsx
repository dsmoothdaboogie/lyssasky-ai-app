import { NavLink } from 'react-router-dom';

interface AdminNavLink {
  to: string;
  label: string;
}

const LINKS: AdminNavLink[] = [
  { to: '/admin/leads', label: 'Leads' },
  { to: '/admin/styles', label: 'Styles' },
  { to: '/admin/testbench', label: 'Test bench' },
  { to: '/admin/config', label: 'Config' },
  { to: '/admin/analytics', label: 'Analytics' },
];

/**
 * Top-level nav for the `/admin` shell. Highlights whichever section the
 * current route falls under (NavLink matches on the "/admin/leads" prefix,
 * so "/admin/leads/:id" still lights up "Leads").
 */
export function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Admin sections">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) => `admin-nav-link${isActive ? ' admin-nav-link-active' : ''}`}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
