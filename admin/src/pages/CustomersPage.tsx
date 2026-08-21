import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/client';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import type { Customer } from '../types';

const INTAKE_URL = import.meta.env.VITE_INTAKE_URL ?? 'http://localhost:5173';

export default function CustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  function refresh() {
    api
      .listCustomers()
      .then(setCustomers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load customers'));
  }

  useEffect(refresh, []);

  const filtered = (customers ?? []).filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
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
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            {customers === null ? 'Loading…' : 'No customers yet.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c._id} onClick={() => navigate(`/customers/${c._id}`)}>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.mobile || '—'}</td>
                  <td>
                    <Badge value={c.status} />
                  </td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
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
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

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

  async function copyLink() {
    if (!created) return;
    await navigator.clipboard.writeText(created.link);
    setCopied(true);
  }

  async function sendEmail() {
    if (!created) return;
    setSending(true);
    setSendResult(null);
    try {
      await api.sendTriggeredEmail('registration', email, name, created.link);
      setSendResult({ ok: true, message: `Email sent to ${email}.` });
    } catch (err) {
      setSendResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to send email' });
    } finally {
      setSending(false);
    }
  }

  if (created) {
    return (
      <Modal title="Send registration link" onClose={onCreated}>
        <p style={{ color: 'var(--muted)' }}>
          {name}'s record is ready. Send them this link to complete their registration.
        </p>
        <div className="link-copy-box">{created.link}</div>
        {sendResult && (
          <div
            className={sendResult.ok ? undefined : 'error-banner'}
            style={
              sendResult.ok
                ? {
                    background: 'var(--sage-badge)',
                    color: 'var(--brand-green)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    marginTop: 14,
                    fontSize: '0.85rem',
                    fontWeight: 500,
                  }
                : { marginTop: 14 }
            }
          >
            {sendResult.message}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button className="btn btn-secondary" onClick={sendEmail} disabled={sending}>
            {sending ? 'Sending…' : 'Send email'}
          </button>
          <button className="btn btn-primary" onClick={onCreated}>
            Done
          </button>
        </div>
      </Modal>
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
