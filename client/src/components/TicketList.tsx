// The Tickets tab: all of the user's tickets in a table with a project filter, Refresh and pagination.
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';

type Ticket = { id: string; projectKey: string; issueKey: string; issueUrl: string; title: string; description: string; severity: string; createdAt: string };
type Page = { tickets: Ticket[]; total: number; page: number; pageSize: number; projects: string[] };

const PAGE_SIZE = 10;

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

// Up to five page numbers around the current page.
function pageNumbers(page: number, pages: number): number[] {
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const end = Math.min(pages, start + 4);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export default function TicketList({ refreshKey, onCreateClick }: { refreshKey: number; onCreateClick: () => void }) {
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [project, setProject] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (project) query.set('projectKey', project);
    api<Page>('GET', `/api/tickets?${query}`)
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, project, refreshKey, reload]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.total, data.page * data.pageSize) : 0;
  const retry = () => setReload((n) => n + 1);

  // If the list shrank while you were on a later page, go back to the last page that exists.
  useEffect(() => {
    if (data && page > pages) setPage(pages);
  }, [data, page, pages]);

  return (
    <div className="card">
      <div className="row">
        <div>
          <h2>Tickets</h2>
          <p className="hint">Findings created through IdentityHub, newest first.</p>
        </div>
        <div className="toolbar">
          <select
            aria-label="Filter by project"
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All projects</option>
            {data?.projects.map((p) => <option key={p}>{p}</option>)}
          </select>
          <button type="button" className="secondary" onClick={retry} disabled={loading}>
            {loading && data ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <p className="banner error" role="alert">
          {data ? 'Could not refresh. Showing last known data.' : error} <button className="link" onClick={retry}>Retry</button>
        </p>
      )}

      {loading && !data && (
        <div className="skeleton-list" aria-label="Loading tickets">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" />)}
        </div>
      )}

      {data && data.total === 0 && (
        <div className="empty">
          <p>No tickets yet. Create your first finding.</p>
          <button type="button" onClick={onCreateClick}>Create a ticket</button>
        </div>
      )}

      {data && data.total > 0 && (
        <>
          <div className="table-wrap">
            <table className="tickets-table">
              <thead>
                <tr><th>Severity</th><th>Ticket</th><th>Project</th><th>Created</th></tr>
              </thead>
              <tbody>
                {data.tickets.map((t) => (
                  <tr key={t.id}>
                    <td className="c-sev"><span className={`badge ${t.severity.toLowerCase()}`}>{t.severity}</span></td>
                    <td className="c-main">
                      <a href={t.issueUrl} target="_blank" rel="noopener noreferrer">{t.title}</a>
                      {t.description && <p className="desc">{t.description}</p>}
                    </td>
                    <td className="c-key"><span className="key-chip">{t.issueKey}</span></td>
                    <td className="c-time nowrap" title={new Date(t.createdAt).toLocaleString()}>{relativeTime(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav className="pagination" aria-label="Pagination">
            <span className="hint">Showing {from}–{to} of {data.total}</span>
            <div className="pager">
              <button type="button" className="secondary" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button>
              {pageNumbers(page, pages).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n === page ? 'page current' : 'page'}
                  aria-current={n === page ? 'page' : undefined}
                  disabled={loading}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
              <button type="button" className="secondary" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
