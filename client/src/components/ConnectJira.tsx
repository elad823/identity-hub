// Jira connection card (connect form or summary) and the project picker shown once connected.
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage } from '../api';

type Connection = { connected: false } | { connected: true; siteUrl: string; email: string; displayName: string };
type Project = { key: string; name: string };

export default function ConnectJira({
  project,
  onProjectChange,
  onConnectedChange,
}: {
  project: string;
  onProjectChange: (key: string) => void;
  onConnectedChange: (connected: boolean) => void;
}) {
  const [conn, setConn] = useState<Connection | null>(null);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(false);

  function load() {
    setLoadError('');
    api<Connection>('GET', '/api/jira/connection')
      .then((c) => {
        setConn(c);
        onConnectedChange(c.connected);
      })
      .catch((err) => setLoadError(errorMessage(err)));
  }
  // Runs once on mount; load only uses setters and a stable callback prop.
  useEffect(load, []);

  if (loadError) {
    return (
      <div className="card">
        <p className="banner error" role="alert">{loadError} <button className="link" onClick={load}>Retry</button></p>
      </div>
    );
  }
  if (!conn) return <div className="card"><p>Loading Jira connection…</p></div>;

  if (!conn.connected || editing) {
    return (
      <ConnectForm
        onSaved={(c) => {
          setConn(c);
          setEditing(false);
          onConnectedChange(true);
        }}
        onCancel={conn.connected ? () => setEditing(false) : undefined}
      />
    );
  }

  return (
    <div className="card">
      <p>
        Connected to <strong>{conn.siteUrl.replace('https://', '')}</strong> as {conn.displayName}{' '}
        <button className="link" onClick={() => setEditing(true)}>Change</button>
      </p>
      <ProjectPicker project={project} onProjectChange={onProjectChange} />
    </div>
  );
}

function ConnectForm({ onSaved, onCancel }: { onSaved: (c: Connection) => void; onCancel?: () => void }) {
  const [siteUrl, setSiteUrl] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      onSaved(await api<Connection>('PUT', '/api/jira/connection', { siteUrl, email, apiToken }));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setFields(err.fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Connect Jira</h2>
      {error && <p className="banner error" role="alert">{error}</p>}
      <label>
        Jira site URL
        <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://yourteam.atlassian.net" required />
        {fields.siteUrl && <span className="field-error">{fields.siteUrl}</span>}
      </label>
      <label>
        Atlassian account email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {fields.email && <span className="field-error">{fields.email}</span>}
      </label>
      <label>
        API token
        <input type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} autoComplete="off" required />
        {fields.apiToken && <span className="field-error">{fields.apiToken}</span>}
      </label>
      <button type="submit" disabled={busy}>{busy ? 'Checking with Jira…' : 'Connect'}</button>
      {onCancel && <button type="button" className="link" onClick={onCancel}>Cancel</button>}
    </form>
  );
}

function ProjectPicker({ project, onProjectChange }: { project: string; onProjectChange: (key: string) => void }) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    setProjects(null);
    api<{ projects: Project[] }>('GET', '/api/jira/projects')
      .then((res) => setProjects(res.projects))
      .catch((err) => setError(errorMessage(err)));
  }
  useEffect(load, []);

  return (
    <label>
      Project
      <input
        list="jira-projects"
        value={project}
        onChange={(e) => onProjectChange(e.target.value.toUpperCase())}
        placeholder="Select or type a project key"
      />
      <datalist id="jira-projects">
        {projects?.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
      </datalist>
      {!projects && !error && <span className="hint">Loading projects…</span>}
      {projects && projects.length === 0 && <span className="hint">No projects found. Type a project key instead.</span>}
      {error && <span className="field-error">{error} <button type="button" className="link" onClick={load}>Retry</button></span>}
    </label>
  );
}
