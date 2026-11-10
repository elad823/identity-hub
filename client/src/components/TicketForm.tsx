// Form to create an NHI finding ticket in the selected project.
import { useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage } from '../api';

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function TicketForm({ project, connected, onCreated }: { project: string; connected: boolean; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ key: string; url: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    setCreated(null);
    try {
      const res = await api<{ ticket: { issueKey: string; issueUrl: string } }>('POST', '/api/tickets', {
        projectKey: project,
        title,
        description,
        severity,
      });
      setCreated({ key: res.ticket.issueKey, url: res.ticket.issueUrl });
      setTitle('');
      setDescription('');
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setFields(err.fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const disabled = !connected || busy;

  return (
    <form className="card" onSubmit={submit}>
      <h2>Create NHI finding</h2>
      {!connected && <p className="banner error">Connect your Jira account first. <a href="#connect">Go to Connect Jira</a></p>}
      {connected && !project && <p className="hint">Choose a project in the Jira card above.</p>}
      {error && <p className="banner error" role="alert">{error}</p>}
      {created && (
        <p className="banner ok" role="status">
          Created <a href={created.url} target="_blank" rel="noopener noreferrer">{created.key}</a>
        </p>
      )}
      <p>Project: <strong>{project || 'none selected'}</strong></p>
      {fields.projectKey && <span className="field-error">{fields.projectKey}</span>}
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={disabled} required />
        {fields.title && <span className="field-error">{fields.title}</span>}
      </label>
      <label>
        Description
        <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} disabled={disabled} required />
        {fields.description && <span className="field-error">{fields.description}</span>}
      </label>
      <label>
        Severity
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} disabled={disabled}>
          {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <button type="submit" disabled={disabled || !project}>{busy ? 'Creating…' : 'Create ticket'}</button>
    </form>
  );
}
