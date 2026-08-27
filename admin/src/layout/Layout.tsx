import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import logo from '../assets/logo.png';
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

export default function Layout() {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showQrLogin, setShowQrLogin] = useState(false);
  // The invoice detail view lays out three columns side by side (list,
  // document preview, activity log) and needs the full window width to
  // avoid squeezing the preview -- every other page is fine at the
  // standard reading-width cap.
  const isWide = location.pathname.startsWith('/invoices');

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
