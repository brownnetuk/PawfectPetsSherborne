import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/client';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import RegistrationLinkModal from '../components/RegistrationLinkModal';
import type { Animal, Customer } from '../types';

const INTAKE_URL = import.meta.env.VITE_INTAKE_URL ?? 'http://localhost:5173';

type Tab = 'active' | 'inactive';

export default function CustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('active');
  const [showNewModal, setShowNewModal] = useState(false);

  function refresh() {
    api
      .listCustomers()
      .then(setCustomers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load customers'));
    // Fetched purely so search can also match a pet's name -- never rendered
    // on this page itself.
    api.listAnimals().then(setAnimals).catch(() => setAnimals([]));
  }

  useEffect(refresh, []);

  const filtered = (customers ?? []).filter((c) => {
    if (tab === 'active' ? c.status === 'inactive' : c.status !== 'inactive') return false;
    const q = search.toLowerCase();
    if (!q) return true;
    if (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) return true;
    return animals.some((a) => a.customer === c._id && a.name.toLowerCase().includes(q));
  });

  return (
    <div>
      <div className="page-header">
        <h1>Customers</h1>
        <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>
          New customer
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="field" style={{ maxWidth: 320 }}>
        <input
          type="text"
          placeholder="Search by name, email, or pet…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="tabs">
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
          Active
        </button>
        <button className={tab === 'inactive' ? 'active' : ''} onClick={() => setTab('inactive')}>
          Inactive
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            {customers === null ? 'Loading…' : tab === 'active' ? 'No active customers yet.' : 'No inactive customers.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone number</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c._id} onClick={() => navigate(`/customers/${c._id}`)}>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.phoneNumber || '—'}</td>
                  <td>
                    <Badge value={c.status} />
                  </td>
                  <td>{new Date(c.createdAt).toLocaleDateString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNewModal && (
        <NewCustomerModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => {
            setShowNewModal(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function NewCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ id: string; link: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const customer = await api.createLead(name, email);
      setCreated({ id: customer._id, link: `${INTAKE_URL}/intake/${customer._id}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <RegistrationLinkModal
        name={name}
        email={email}
        link={created.link}
        customerId={created.id}
        autoSent
        onDone={onCreated}
      />
    );
  }

  return (
    <Modal title="New customer" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          This creates a pending record and gives you a link to send the customer, so they can
          complete the rest of their details themselves.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create & get link'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
