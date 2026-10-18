import { useEffect, useState } from 'react';
import logo from './assets/logo.png';
import { getToken, setToken, setUnauthorizedHandler } from './api';
import Login from './Login';
import DetailsPage from './pages/DetailsPage';
import DocumentsPage from './pages/DocumentsPage';
import PetsPage from './pages/PetsPage';
import BookingsPage from './pages/BookingsPage';

const TABS = [
  { key: 'details', label: 'My Details' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'pets', label: 'My Pets' },
  { key: 'bookings', label: 'Bookings' },
] as const;
type Tab = (typeof TABS)[number]['key'];

function tabFromHash(): Tab {
  const hash = window.location.hash.replace('#', '');
  return TABS.some((t) => t.key === hash) ? (hash as Tab) : 'details';
}

export default function App() {
  const [token, setTokenState] = useState(getToken());
  const [tab, setTab] = useState<Tab>(tabFromHash());
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setTokenState(null);
      setExpired(true);
    });
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const signIn = (t: string) => {
    setToken(t);
    setTokenState(t);
    setExpired(false);
  };

  const signOut = () => {
    setToken(null);
    setTokenState(null);
  };

  return (
    <div className="page">
      <header className="brand-header">
        <img src={logo} alt="" className="brand-logo" />
        <span>Customer Portal</span>
        {token && (
          <button className="btn btn-secondary btn-small" onClick={signOut}>
            Sign out
          </button>
        )}
      </header>

      {!token ? (
        <>
          {expired && <p className="notice narrow-width">Your session has ended. Please sign in again.</p>}
          <Login onSignedIn={signIn} />
        </>
      ) : (
        <>
          <nav className="tabs" aria-label="Portal sections">
            {TABS.map((t) => (
              <a
                key={t.key}
                href={`#${t.key}`}
                className={t.key === tab ? 'tab active' : 'tab'}
                aria-current={t.key === tab ? 'page' : undefined}
              >
                {t.label}
              </a>
            ))}
          </nav>
          <main className="card">
            {tab === 'details' && <DetailsPage />}
            {tab === 'invoices' && <DocumentsPage key="invoices" kind="invoices" />}
            {tab === 'quotes' && <DocumentsPage key="quotes" kind="quotes" />}
            {tab === 'pets' && <PetsPage />}
            {tab === 'bookings' && <BookingsPage />}
          </main>
        </>
      )}
      <footer className="footer">v{__APP_VERSION__}</footer>
    </div>
  );
}
