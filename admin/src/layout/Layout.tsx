import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export default function Layout() {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">PawfectPets</div>
        <nav>
          <NavLink to="/customers" className={({ isActive }) => (isActive ? 'active' : '')}>
            Customers
          </NavLink>
          <NavLink to="/bookings" className={({ isActive }) => (isActive ? 'active' : '')}>
            Bookings
          </NavLink>
          <NavLink to="/invoices" className={({ isActive }) => (isActive ? 'active' : '')}>
            Invoices
          </NavLink>
          <NavLink to="/activity" className={({ isActive }) => (isActive ? 'active' : '')}>
            Activity
          </NavLink>
          <NavLink to="/staff" className={({ isActive }) => (isActive ? 'active' : '')}>
            Staff
          </NavLink>
        </nav>
      </aside>
      <div className="main-area">
        <div className="topbar">
          <span className="staff-name">{staff?.name}</span>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
            Log out
          </button>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
