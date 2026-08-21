import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/client';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { TrashIcon } from '../components/icons';
import type { Customer, Enquiry, EnquiryService } from '../types';

const INTAKE_URL = import.meta.env.VITE_INTAKE_URL ?? 'http://localhost:5173';

const SERVICE_OPTIONS: { value: EnquiryService; label: string }[] = [
  { value: 'dog_walking', label: 'Dog Walking' },
  { value: 'pet_visits', label: 'Pet Visits' },
  { value: 'boarding', label: 'Boarding' },
  { value: 'day_care', label: 'Day Care' },
];

function serviceLabel(value: string): string {
  return SERVICE_OPTIONS.find((s) => s.value === value)?.label ?? value;
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showEnquiryModal, setShowEnquiryModal] = useState(false);
  const [enquiries, setEnquiries] = useState<Enquiry[] | null>(null);
  const [enquiryError, setEnquiryError] = useState<string | null>(null);
  const [viewingEnquiry, setViewingEnquiry] = useState<Enquiry | null>(null);
  const [deletingEnquiry, setDeletingEnquiry] = useState<Enquiry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertedCustomer, setConvertedCustomer] = useState<{
    id: string;
    name: string;
    email: string;
    link: string;
  } | null>(null);

  function refresh() {
    api
      .listCustomers()
      .then(setCustomers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load customers'));
  }

  function refreshEnquiries() {
    api
      .listEnquiries()
      .then(setEnquiries)
      .catch((err) => setEnquiryError(err instanceof Error ? err.message : 'Failed to load enquiries'));
  }

  useEffect(refresh, []);
  useEffect(refreshEnquiries, []);

  async function handleDeleteEnquiry() {
    if (!deletingEnquiry) return;
    setDeleting(true);
    try {
      await api.deleteEnquiry(deletingEnquiry._id);
      setDeletingEnquiry(null);
      refreshEnquiries();
    } finally {
      setDeleting(false);
    }
  }

  async function handleConvertEnquiry() {
    if (!viewingEnquiry) return;
    if (!viewingEnquiry.email) {
      setConvertError('This enquiry has no email address — add one before converting to a customer.');
      return;
    }
    setConverting(true);
    setConvertError(null);
    try {
      const customer = await api.createLead(viewingEnquiry.name, viewingEnquiry.email);
      const patch: Record<string, unknown> = {};
      if (viewingEnquiry.address) patch.address = viewingEnquiry.address;
      if (viewingEnquiry.phone) patch.mobile = viewingEnquiry.phone;
      if (Object.keys(patch).length > 0) {
        await api.updateCustomer(customer._id, patch);
      }
      await api.deleteEnquiry(viewingEnquiry._id);
      setConvertedCustomer({
        id: customer._id,
        name: viewingEnquiry.name,
        email: viewingEnquiry.email,
        link: `${INTAKE_URL}/intake/${customer._id}`,
      });
      setViewingEnquiry(null);
      refresh();
      refreshEnquiries();
    } catch (err) {
      setConvertError(err instanceof Error ? err.message : 'Failed to convert enquiry to a customer');
    } finally {
      setConverting(false);
    }
  }

  const filtered = (customers ?? []).filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="page-header">
        <h1>Customers</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowEnquiryModal(true)}>
            Customer Enquiry
          </button>
          <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>
            New customer
          </button>
        </div>
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

      <div className="section-title">Enquiries</div>
      {enquiryError && <div className="error-banner">{enquiryError}</div>}
      <div className="card" style={{ padding: 0 }}>
        {!enquiries || enquiries.length === 0 ? (
          <div className="empty-state">{enquiries === null ? 'Loading…' : 'No enquiries yet.'}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Services interested in</th>
                <th>Received</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {enquiries.map((e) => (
                <tr
                  key={e._id}
                  onClick={() => {
                    setViewingEnquiry(e);
                    setConvertError(null);
                  }}
                >
                  <td>{e.name}</td>
                  <td>{e.email || e.phone || '—'}</td>
                  <td>{e.servicesInterested.length > 0 ? e.servicesInterested.map(serviceLabel).join(', ') : '—'}</td>
                  <td>{new Date(e.createdAt).toLocaleDateString()}</td>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    <button
                      className="icon-btn icon-btn-danger"
                      title="Delete"
                      onClick={() => setDeletingEnquiry(e)}
                    >
                      <TrashIcon />
                    </button>
                  </td>
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

      {showEnquiryModal && (
        <NewEnquiryModal
          onClose={() => setShowEnquiryModal(false)}
          onCreated={() => {
            setShowEnquiryModal(false);
            refreshEnquiries();
          }}
        />
      )}

      {viewingEnquiry && (
        <Modal title={viewingEnquiry.name} onClose={() => setViewingEnquiry(null)}>
          <dl className="kv-grid">
            <dt>Email</dt>
            <dd>{viewingEnquiry.email || '—'}</dd>
            <dt>Phone</dt>
            <dd>{viewingEnquiry.phone || '—'}</dd>
            <dt>Address</dt>
            <dd>{viewingEnquiry.address || '—'}</dd>
            <dt>Heard about us via</dt>
            <dd>{viewingEnquiry.howHeard || '—'}</dd>
            <dt>Services interested in</dt>
            <dd>
              {viewingEnquiry.servicesInterested.length > 0
                ? viewingEnquiry.servicesInterested.map(serviceLabel).join(', ')
                : '—'}
            </dd>
            <dt>Received</dt>
            <dd>{new Date(viewingEnquiry.createdAt).toLocaleString()}</dd>
          </dl>
          <div className="section-title">Notes</div>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{viewingEnquiry.notes || '—'}</p>
          {convertError && <div className="error-banner">{convertError}</div>}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setViewingEnquiry(null)}>
              Close
            </button>
            <button className="btn btn-primary" onClick={handleConvertEnquiry} disabled={converting}>
              {converting ? 'Converting…' : 'Convert to Customer'}
            </button>
          </div>
        </Modal>
      )}

      {convertedCustomer && (
        <RegistrationLinkModal
          name={convertedCustomer.name}
          email={convertedCustomer.email}
          link={convertedCustomer.link}
          onDone={() => setConvertedCustomer(null)}
        />
      )}

      {deletingEnquiry && (
        <Modal title="Delete enquiry?" onClose={() => setDeletingEnquiry(null)}>
          <p>
            This permanently deletes the enquiry from <strong>{deletingEnquiry.name}</strong>.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeletingEnquiry(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDeleteEnquiry} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete enquiry'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NewEnquiryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [howHeard, setHowHeard] = useState('');
  const [services, setServices] = useState<EnquiryService[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleService(value: EnquiryService) {
    setServices((s) => (s.includes(value) ? s.filter((v) => v !== value) : [...s, value]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createEnquiry({
        name,
        email: email || undefined,
        address: address || undefined,
        phone: phone || undefined,
        howHeard: howHeard || undefined,
        servicesInterested: services,
        notes: notes || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save enquiry');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Customer Enquiry" onClose={onClose} wide>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Customer Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Customer Email</label>
          <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Address</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="field">
          <label>Phone Number</label>
          <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label>Where did you hear about us?</label>
          <input type="text" value={howHeard} onChange={(e) => setHowHeard(e.target.value)} />
        </div>
        <div className="field">
          <label>Services interested in?</label>
          {SERVICE_OPTIONS.map((opt) => (
            <label key={opt.value} style={{ display: 'block', fontWeight: 400, marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={services.includes(opt.value)}
                onChange={() => toggleService(opt.value)}
                style={{ marginRight: 8 }}
              />
              {opt.label}
            </label>
          ))}
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save enquiry'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RegistrationLinkModal({
  name,
  email,
  link,
  onDone,
}: {
  name: string;
  email: string;
  link: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  async function sendEmail() {
    setSending(true);
    setSendResult(null);
    try {
      await api.sendTriggeredEmail('registration', email, name, link);
      setSendResult({ ok: true, message: `Email sent to ${email}.` });
    } catch (err) {
      setSendResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to send email' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title="Send registration link" onClose={onDone}>
      <p style={{ color: 'var(--muted)' }}>
        {name}'s record is ready. Send them this link to complete their registration.
      </p>
      <div className="link-copy-box">{link}</div>
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
        <button className="btn btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </Modal>
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
    return <RegistrationLinkModal name={name} email={email} link={created.link} onDone={onCreated} />;
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
