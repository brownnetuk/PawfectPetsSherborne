import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './layout/Layout';
import LoginPage from './pages/LoginPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import EnquiriesPage from './pages/EnquiriesPage';
import BookingsPage from './pages/BookingsPage';
import FinancialPage from './pages/FinancialPage';
import ReportsPage from './pages/ReportsPage';
import InvoicesPage from './pages/InvoicesPage';
import SettingsPage from './pages/SettingsPage';

function ProtectedLayout() {
  const { staff, loading } = useAuth();
  if (loading) return <div className="empty-state">Loading…</div>;
  if (!staff) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Navigate to="/customers" replace />} />
        <Route path="/enquiries" element={<EnquiriesPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/bookings" element={<BookingsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/financial" element={<FinancialPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
