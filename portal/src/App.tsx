import { useEffect, useState, type ReactNode } from 'react';
import logo from './assets/logo.png';
import { getToken, setToken, setUnauthorizedHandler } from './api';
import Login from './Login';
import DetailsPage from './pages/DetailsPage';
import DocumentsPage from './pages/DocumentsPage';
import PetsPage from './pages/PetsPage';
import BookingsPage from './pages/BookingsPage';
import {
  BoardingIcon,
  BookingsIcon,
  CustomersIcon,
  InvoicesIcon,
  LogoutIcon,
  ReportsIcon,
} from './icons';

const TABS: { key: string; label: string; icon: ReactNode }[] = [
  { key: 'details', label: 'My Details', icon: <CustomersIcon /> },
  { key: 'invoices', label: 'Invoices', icon: <InvoicesIcon /> },
  { key: 'quotes', label: 'Quotes', icon: <ReportsIcon /> },
  { key: 'pets', label: 'My Pets', icon: <BoardingIcon /> },
  { key: 'bookings', label: 'Bookings', icon: <BookingsIcon /> },
];

function tabFromHash(): string {
  const hash = window.location.hash.replace('#', '');
  return TABS.some((t) => t.key === hash) ? hash : 'details';
}

export default function App() {
  const [token, setTokenState] = useState(getToken());
  const [tab, setTab] = useState(tabFromHash());
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

  // Signed out: the admin app's login screen (blue page, white card).
  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <span className="login-logo">
            <img src={logo} alt="Pawfect Pets Sherborne" />
          </span>
          <h1>Pawfect Pets Sherborne</h1>
          <p className="login-tagline">Customer portal</p>
          {expired && <div className="success-banner">Your session has ended. Please sign in again.</div>}
          <Login onSignedIn={signIn} />
        </div>
        <div className="login-version">v{__APP_VERSION__}</div>
      </div>
    );
  }

  const current = TABS.find((t) => t.key === tab) ?? TABS[0];

  // Signed in: the admin app's shell -- cream sidebar with yellow active
  // pill (a top bar on phones), and each page under a blue header band.
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="logo-badge">
            <img src={logo} alt="" />
          </span>
          <span>
            Pawfect Pets
            <span className="sidebar-brand-sub">Sherborne · Customer Portal</span>
          </span>
        </div>
        <nav aria-label="Portal sections">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={`#${t.key}`}
              className={t.key === tab ? 'active' : undefined}
              aria-current={t.key === tab ? 'page' : undefined}
            >
              {t.icon}
              {t.label}
            </a>
          ))}
        </nav>
        <button className="sidebar-signout" onClick={signOut}>
          <LogoutIcon />
          Sign out
        </button>
        <div className="app-version">v{__APP_VERSION__}</div>
      </aside>
      <main className="content">
        <div className="page-header">
          <h1>{current.label}</h1>
        </div>
        <div className="card">
          {tab === 'details' && <DetailsPage />}
          {tab === 'invoices' && <DocumentsPage key="invoices" kind="invoices" />}
          {tab === 'quotes' && <DocumentsPage key="quotes" kind="quotes" />}
          {tab === 'pets' && <PetsPage />}
          {tab === 'bookings' && <BookingsPage />}
        </div>
      </main>
    </div>
  );
}
