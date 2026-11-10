// Form to create an NHI finding ticket in the selected project.
import { useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage } from '../api';

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function TicketForm({
  project,
  connected,
  onCreated,
  onGoToJira,
  onViewTickets,
}: {
  project: string;
  connected: boolean | null;
  onCreated: () => void;
  onGoToJira: () => void;
  onViewTickets: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('MEDIUM');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ key: string; url: string; prioritySet: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || connected !== true) return;
    setBusy(true);
    setError('');
    setFields({});
    setCreated(null);
    try {
      const res = await api<{ ticket: { issueKey: string; issueUrl: string }; prioritySet: boolean }>('POST', '/api/tickets', {
        projectKey: project,
        title,
        description,
        severity,
      });
      setCreated({ key: res.ticket.issueKey, url: res.ticket.issueUrl, prioritySet: res.prioritySet });
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

  const disabled = connected !== true || busy;

  return (
    <form className="card ticket-form" onSubmit={submit}>
      <h2>Create NHI finding</h2>
      {connected === null && (
        <p className="hint">
          Checking your Jira connection… <button type="button" className="link" onClick={onGoToJira}>Open the Jira tab</button>
        </p>
      )}
      {connected === false && <p className="banner error">Connect your Jira account first. <button type="button" className="link" onClick={onGoToJira}>Go to the Jira tab</button></p>}
      {connected === true && !project && <p className="hint">Choose a project above.</p>}
      {error && <p className="banner error" role="alert">{error}</p>}
      {created && (
        <p className="banner ok" role="status">
          Created <a href={created.url} target="_blank" rel="noopener noreferrer">{created.key}</a>
          {!created.prioritySet && ' Jira does not allow setting Priority in this project, so only the severity label was added.'}{' '}
          <button type="button" className="link" onClick={onViewTickets}>View all tickets</button>
        </p>
      )}
      <p>Project: <strong>{project || 'none selected'}</strong></p>
      {fields.projectKey && <span className="field-error">{fields.projectKey}</span>}
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={disabled} aria-invalid={!!fields.title} required />
        {fields.title && <span className="field-error">{fields.title}</span>}
      </label>
      <label>
        Severity
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} disabled={disabled}>
          {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label>
        Description
        <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} disabled={disabled} aria-invalid={!!fields.description} required />
        {fields.description && <span className="field-error">{fields.description}</span>}
      </label>
      <button type="submit" disabled={disabled || !project}>{busy ? 'Creating…' : 'Create ticket'}</button>
    </form>
  );
}
