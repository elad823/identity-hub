// Panel to generate or replace the API key. The new key is shown once with a copy button.
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';

type KeyInfo = { exists: false } | { exists: true; prefix: string; createdAt: string };

export default function ApiKeyPanel() {
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [copyNote, setCopyNote] = useState('');

  function load() {
    setError('');
    api<KeyInfo>('GET', '/api/api-key')
      .then(setInfo)
      .catch((err) => setError(errorMessage(err)));
  }
  useEffect(load, []);

  async function generate() {
    setBusy(true);
    setError('');
    setCopyNote('');
    try {
      const res = await api<{ apiKey: string; prefix: string }>('POST', '/api/api-key');
      setNewKey(res.apiKey);
      setInfo({ exists: true, prefix: res.prefix, createdAt: new Date().toISOString() });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(newKey);
      setCopyNote('Copied');
    } catch {
      setCopyNote('Could not copy. Select the key and copy it by hand.');
    }
  }

  return (
    <div className="card">
      <h2>API key</h2>
      {error && <p className="banner error" role="alert">{error} <button className="link" onClick={load}>Retry</button></p>}
      {!info && !error && <p>Loading…</p>}
      {info && !info.exists && <p>No API key yet. Generate one to create tickets from other systems.</p>}
      {info && info.exists && !newKey && <p>Current key starts with <code>{info.prefix}</code>. The full key is not shown again.</p>}
      {newKey && (
        <div className="banner ok">
          <p>Copy this key now. It will not be shown again.</p>
          <code className="key">{newKey}</code>{' '}
          <button type="button" onClick={copy}>Copy</button> {copyNote}
        </div>
      )}
      {info && (
        <button type="button" onClick={generate} disabled={busy}>
          {busy ? 'Working…' : info.exists ? 'Replace key' : 'Generate key'}
        </button>
      )}
      {info && info.exists && <p className="hint">Replacing the key stops the old one from working.</p>}
    </div>
  );
}
