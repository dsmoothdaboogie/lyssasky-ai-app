import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { fetchAllStyles, apiAdminDeleteStyle } from '../firebase/api';
import type { Style } from '../domain/types';

/**
 * Admin-only styles table at /admin/styles. Fetches every style (including
 * inactive ones — admins need to see and manage the full catalog, unlike
 * the public funnel which only shows active styles), ordered by sortOrder.
 */
export function StylesListPage() {
  const [styles, setStyles] = useState<Style[] | null>(null);

  const loadStyles = useCallback(() => {
    return fetchAllStyles().then((result) => {
      setStyles(result);
    });
  }, []);

  useEffect(() => {
    void loadStyles();
  }, [loadStyles]);

  const handleDelete = async (slug: string, name: string) => {
    if (!window.confirm(`Delete the "${name}" style? This can't be undone.`)) return;
    await apiAdminDeleteStyle(slug);
    await loadStyles();
  };

  if (styles === null) {
    return (
      <div className="admin-shell admin-shell-centered">
        <p role="status">Loading styles…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-leads-toolbar">
        <h1>Styles</h1>
        <Link to="/admin/styles/new" className="btn btn-primary">
          New style
        </Link>
      </div>

      <table className="admin-leads-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Slug</th>
            <th scope="col">Sort order</th>
            <th scope="col">Status</th>
            <th scope="col" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {styles.map((style) => (
            <tr key={style.slug}>
              <td>{style.name}</td>
              <td>{style.slug}</td>
              <td>{style.sortOrder}</td>
              <td>
                <span className={`status-chip ${style.active ? 'status-chip-booked' : 'status-chip-failed'}`}>
                  {style.active ? 'active' : 'inactive'}
                </span>
              </td>
              <td>
                <Link to={`/admin/styles/${style.slug}`}>Edit</Link>{' '}
                <Button
                  variant="secondary"
                  onClick={() => void handleDelete(style.slug, style.name)}
                >
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {styles.length === 0 && <p className="text-muted">No styles yet.</p>}
    </div>
  );
}
