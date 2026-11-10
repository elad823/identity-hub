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
  const [confirming, setConfirming] = useState(false);

  function load() {
    setError('');
    api<KeyInfo>('GET', '/api/api-key')
      .then(setInfo)
      .catch((err) => setError(errorMessage(err)));
  }
  useEffect(load, []);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setConfirming(false);
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
          <button type="button" onClick={copy}>Copy</button> {copyNote}{' '}
          <button type="button" className="link" onClick={() => setNewKey('')}>I have saved it</button>
        </div>
      )}
      {info && !confirming && (
        <button type="button" onClick={info.exists ? () => setConfirming(true) : generate} disabled={busy}>
          {busy ? 'Working…' : info.exists ? 'Replace key' : 'Generate key'}
        </button>
      )}
      {info && confirming && (
        <div className="banner error" role="alert">
          <p>The current key stops working immediately, including the digest script until you update <code>DIGEST_API_KEY</code>.</p>
          <div className="actions">
            <button type="button" onClick={generate} disabled={busy}>Yes, replace it</button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
