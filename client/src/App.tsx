// Top-level page: checks the session, then shows the login form or the signed-in view.
import { useEffect, useState } from 'react';
import { api, errorMessage } from './api';
import LoginForm, { type User } from './components/LoginForm';
import ConnectJira from './components/ConnectJira';
import TicketForm from './components/TicketForm';
import RecentTickets from './components/RecentTickets';
import ApiKeyPanel from './components/ApiKeyPanel';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [project, setProject] = useState('');
  const [connected, setConnected] = useState(false);
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

  async function logout() {
    try {
      await api('POST', '/api/auth/logout');
      setUser(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <main>
      <h1>IdentityHub</h1>
      {error && (
        <p className="banner error" role="alert">
          {error} <button className="link" onClick={loadMe}>Retry</button>
        </p>
      )}
      {user === undefined && !error && <p>Loading…</p>}
      {user === null && <LoginForm onSignedIn={setUser} />}
      {user && (
        <>
          <div className="card">
            <p>Signed in as <strong>{user.email}</strong></p>
            <button onClick={logout}>Log out</button>
          </div>
          <div id="connect">
            <ConnectJira project={project} onProjectChange={setProject} onConnectedChange={setConnected} />
          </div>
          <TicketForm project={project} connected={connected} onCreated={() => setRefreshKey((n) => n + 1)} />
          <RecentTickets project={project} refreshKey={refreshKey} />
          <ApiKeyPanel />
        </>
      )}
    </main>
  );
}
