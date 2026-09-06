import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './layout/Layout';
import LoginPage from './pages/LoginPage';

// Route-level code-splitting: each page is its own chunk, fetched on first
// navigation, so the initial bundle stays small (the heaviest pages -- e.g.
// SettingsPage -- no longer load until they're actually opened).
const CustomersPage = lazy(() => import('./pages/CustomersPage'));
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'));
const EnquiriesPage = lazy(() => import('./pages/EnquiriesPage'));
const BookingsPage = lazy(() => import('./pages/BookingsPage'));
const FinancialPage = lazy(() => import('./pages/FinancialPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'));
const CommunicationsPage = lazy(() => import('./pages/CommunicationsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function ProtectedLayout() {
  const { staff, loading } = useAuth();
  if (loading) return <div className="empty-state">Loading…</div>;
  if (!staff) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <Suspense fallback={<div className="empty-state">Loading…</div>}>
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
          <Route path="/communications" element={<CommunicationsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
