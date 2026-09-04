import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import * as api from '../api/client';
import logo from '../assets/logo.png';
import NotificationBell from '../components/NotificationBell';
import QrLoginModal from '../components/QrLoginModal';
import {
  BookingsIcon,
  CustomersIcon,
  EnquiriesIcon,
  FinancialIcon,
  InvoicesIcon,
  LogoutIcon,
  ReportsIcon,
  SettingsIcon,
} from '../components/icons';

function initials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

// Simple chat-bubble glyph (kept inline — the shared icons file has no chat
// icon and this is the only place that needs one).
function MessagesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z" />
    </svg>
  );
}

export default function Layout() {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showQrLogin, setShowQrLogin] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Poll the unread-message count for the nav badge.
  useEffect(() => {
    let active = true;
    const tick = () =>
      api
        .messagesUnreadCount()
        .then((r) => active && setUnreadMessages(r.count))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [location.pathname]);
  // The invoice detail view lays out three columns side by side (list,
  // document preview, activity log) and needs the full window width to
  // avoid squeezing the preview -- every other page is fine at the
  // standard reading-width cap. Bookings needs it too: a 7-day-wide
  // calendar grid plus the day panel gets cramped under the standard cap.
  const isWide = location.pathname.startsWith('/invoices') || location.pathname.startsWith('/bookings');

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="logo-badge">
            <img src={logo} alt="" />
          </span>
          Pawfect Pets
        </div>
        <nav>
          <NavLink to="/enquiries" className={({ isActive }) => (isActive ? 'active' : '')}>
            <EnquiriesIcon />
            Enquiries
          </NavLink>
          <NavLink to="/customers" className={({ isActive }) => (isActive ? 'active' : '')}>
            <CustomersIcon />
            Customers
          </NavLink>
          <NavLink to="/bookings" className={({ isActive }) => (isActive ? 'active' : '')}>
            <BookingsIcon />
            Bookings
          </NavLink>
          <NavLink to="/invoices" className={({ isActive }) => (isActive ? 'active' : '')}>
            <InvoicesIcon />
            Invoices &amp; Quotes
          </NavLink>
          <NavLink to="/financial" className={({ isActive }) => (isActive ? 'active' : '')}>
            <FinancialIcon />
            Financial
          </NavLink>
          <NavLink to="/communications" className={({ isActive }) => (isActive ? 'active' : '')}>
            <MessagesIcon />
            Communications
            {unreadMessages > 0 && (
              <span
                style={{
                  marginLeft: 'auto',
                  background: 'var(--brand-green)',
                  color: 'white',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1px 7px',
                }}
              >
                {unreadMessages}
              </span>
            )}
          </NavLink>
          <NavLink to="/reports" className={({ isActive }) => (isActive ? 'active' : '')}>
            <ReportsIcon />
            Reports
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
            <SettingsIcon />
            Settings
          </NavLink>
        </nav>
      </aside>
      <div className="main-area">
        <div className="topbar">
          <span className="app-version" title="Admin app version">
            v{__APP_VERSION__}
          </span>
          <NotificationBell />
          <button
            className="avatar avatar-btn"
            onClick={() => setShowQrLogin(true)}
            title="Show QR code to connect the mobile app"
            type="button"
          >
            {initials(staff?.name)}
          </button>
          <span className="staff-name">{staff?.name}</span>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
            <LogoutIcon />
            Log out
          </button>
        </div>
        <div className={isWide ? 'content content-wide' : 'content'}>
          <Outlet />
        </div>
      </div>
      {showQrLogin && <QrLoginModal onClose={() => setShowQrLogin(false)} />}
    </div>
  );
}
