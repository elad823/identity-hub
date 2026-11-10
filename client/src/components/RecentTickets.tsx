// The 10 most recent tickets for the selected project, with skeleton, empty and keep-old-rows error states.
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';

type Ticket = { id: string; issueKey: string; issueUrl: string; title: string; severity: string; createdAt: string };

const KEY_RE = /^[A-Z][A-Z0-9_]{1,9}$/;

function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export default function RecentTickets({ project, refreshKey }: { project: string; refreshKey: number }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const valid = KEY_RE.test(project);

  useEffect(() => {
    setTickets(null);
  }, [project]);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    api<{ tickets: Ticket[] }>('GET', `/api/tickets?projectKey=${encodeURIComponent(project)}`)
      .then((res) => !cancelled && setTickets(res.tickets))
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [project, valid, refreshKey, reload]);

  return (
    <div className="card">
      <div className="row">
        <h2>Recent tickets</h2>
        <button type="button" onClick={() => setReload((n) => n + 1)} disabled={!valid || loading}>Refresh</button>
      </div>
      {!valid && <p className="hint">Choose a project to see its recent tickets.</p>}
      {valid && error && (
        <p className="banner error" role="alert">
          {tickets ? 'Could not refresh. Showing last known data.' : error}{' '}
          <button className="link" onClick={() => setReload((n) => n + 1)}>Retry</button>
        </p>
      )}
      {valid && !tickets && loading && (
        <ul className="tickets">{[0, 1, 2].map((i) => <li key={i} className="skeleton" />)}</ul>
      )}
      {valid && tickets && tickets.length === 0 && <p>No tickets yet. Create your first finding above.</p>}
      {valid && tickets && tickets.length > 0 && (
        <ul className="tickets">
          {tickets.map((t) => (
            <li key={t.id}>
              <span className={`badge ${t.severity.toLowerCase()}`}>{t.severity}</span>
              <a href={t.issueUrl} target="_blank" rel="noopener noreferrer">{t.title}</a>
              <span className="hint">{t.issueKey} · {relativeTime(t.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
