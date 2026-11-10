// Top-level page: checks the session, then shows the login form or the signed-in view with tabs.
import { useEffect, useState } from 'react';
import { api, errorMessage, setSessionExpiredHandler } from './api';
import LoginForm, { type User } from './components/LoginForm';
import ConnectJira, { ProjectPicker } from './components/ConnectJira';
import TicketForm from './components/TicketForm';
import TicketList from './components/TicketList';
import ApiKeyPanel from './components/ApiKeyPanel';

type Tab = 'create' | 'tickets' | 'jira' | 'api';
const TABS: { id: Tab; label: string }[] = [
  { id: 'create', label: 'Create' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'jira', label: 'Jira' },
  { id: 'api', label: 'API key' },
];

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('create');
  const [project, setProject] = useState('');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [notice, setNotice] = useState('');
  const [connVersion, setConnVersion] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  function loadMe() {
    setError('');
    api<{ user: User }>('GET', '/api/auth/me')
      .then((res) => setUser(res.user))
      .catch((err) => {
        if (err.code === 'UNAUTHENTICATED') setUser(null);
        else setError(errorMessage(err));
      });
  }

  useEffect(loadMe, []);

  // Back to the login screen with everything of the old session forgotten.
  function resetSession() {
    setUser(null);
    setTab('create');
    setProject('');
    setConnected(null);
  }

  // Any data call that comes back "please log in" means the session ended.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      resetSession();
      setNotice('Your session ended. Please log in again.');
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  async function logout() {
    try {
      await api('POST', '/api/auth/logout');
      resetSession();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  // A user without a Jira connection lands on the Jira tab. The picker reloads its list when the connection changes.
  function onConnectedChange(isConnected: boolean | null) {
    setConnected(isConnected);
    setConnVersion((v) => v + 1);
    if (!isConnected) setTab('jira');
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">IH</span>
          <h1>IdentityHub</h1>
        </div>
        {user && (
          <div className="who">
            <span className="avatar" aria-hidden="true">{user.email[0]?.toUpperCase()}</span>
            <span className="email">{user.email}</span>
            <button className="secondary" onClick={logout}>Log out</button>
          </div>
        )}
      </header>

      {error && (
        <p className="banner error" role="alert">
          {error} <button className="link" onClick={loadMe}>Retry</button>
        </p>
      )}
      {user === undefined && !error && <p>Loading…</p>}
      {user === null && (
        <>
          <p className="tagline">Create Jira tickets for non-human identity findings.</p>
          {notice && <p className="banner error auth-notice" role="alert">{notice}</p>}
          <LoginForm
            onSignedIn={(u) => {
              setNotice('');
              setUser(u);
            }}
          />
        </>
      )}

      {user && (
        <>
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                className={tab === t.id ? 'tab active' : 'tab'}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* All panels stay mounted and are only hidden, so each keeps its data when you switch tabs. */}
          <section role="tabpanel" id="panel-create" aria-labelledby="tab-create" hidden={tab !== 'create'}>
            {connected === true && (
              <div className="card">
                <ProjectPicker key={connVersion} project={project} onProjectChange={setProject} />
              </div>
            )}
            <TicketForm
              project={project}
              connected={connected}
              onCreated={() => setRefreshKey((n) => n + 1)}
              onGoToJira={() => setTab('jira')}
              onViewTickets={() => setTab('tickets')}
            />
          </section>
          <section role="tabpanel" id="panel-tickets" aria-labelledby="tab-tickets" hidden={tab !== 'tickets'}>
            <TicketList refreshKey={refreshKey} onCreateClick={() => setTab('create')} />
          </section>
          <section role="tabpanel" id="panel-jira" aria-labelledby="tab-jira" hidden={tab !== 'jira'}>
            <ConnectJira onConnectedChange={onConnectedChange} />
          </section>
          <section role="tabpanel" id="panel-api" aria-labelledby="tab-api" hidden={tab !== 'api'}>
            <ApiKeyPanel />
          </section>
        </>
      )}
    </main>
  );
}
