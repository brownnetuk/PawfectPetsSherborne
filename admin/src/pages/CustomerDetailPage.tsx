import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/client';
import Badge from '../components/Badge';
import EditAnimalModal from '../components/EditAnimalModal';
import EditCustomerModal from '../components/EditCustomerModal';
import Modal from '../components/Modal';
import type { Animal, Booking, Customer, CrmActivity, Invoice } from '../types';
import { useAuth } from '../auth/AuthContext';

const INTAKE_URL = import.meta.env.VITE_INTAKE_URL ?? 'http://localhost:5173';

type Tab = 'overview' | 'pets' | 'bookings' | 'invoices' | 'activity';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activity, setActivity] = useState<CrmActivity[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [alarmInstructions, setAlarmInstructions] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  function refresh() {
    if (!id) return;
    api.getCustomer(id).then(setCustomer).catch((err) => setError(err.message));
    api.listAnimals(id).then(setAnimals).catch(() => {});
    api.listBookings(id).then(setBookings).catch(() => {});
    api.listInvoices(id).then(setInvoices).catch(() => {});
    api.listActivities(id).then(setActivity).catch(() => {});
  }

  useEffect(refresh, [id]);

  if (!id) return null;
  if (error) return <div className="error-banner">{error}</div>;
  if (!customer) return <div className="empty-state">Loading…</div>;

  const intakeLink = `${INTAKE_URL}/intake/${customer._id}`;

  async function copyLink() {
    await navigator.clipboard.writeText(intakeLink);
    setCopied(true);
  }

  async function revealAlarm() {
    if (!id) return;
    const value = await api.getAlarmInstructions(id);
    setAlarmInstructions(value ?? '(none provided)');
  }

  async function handleDelete() {
    if (!id) return;
    await api.deleteCustomer(id);
    navigate('/customers');
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{customer.name}</h1>
          <div style={{ marginTop: 6 }}>
            <Badge value={customer.status} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {customer.status === 'pending' && (
            <button className="btn btn-secondary" onClick={copyLink}>
              {copied ? 'Copied!' : 'Copy registration link'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setShowEdit(true)}>
            Edit
          </button>
          <button className="btn btn-danger" onClick={() => setShowDelete(true)}>
            Delete
          </button>
        </div>
      </div>

      <div className="tabs">
        {(['overview', 'pets', 'bookings', 'invoices', 'activity'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'pets' ? `Pets (${animals.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab
          customer={customer}
          alarmInstructions={alarmInstructions}
          onRevealAlarm={revealAlarm}
        />
      )}
      {tab === 'pets' && <PetsTab animals={animals} onChange={refresh} />}
      {tab === 'bookings' && (
        <BookingsTab customer={customer} animals={animals} bookings={bookings} onChange={refresh} />
      )}
      {tab === 'invoices' && (
        <InvoicesTab customer={customer} invoices={invoices} onChange={refresh} />
      )}
      {tab === 'activity' && (
        <ActivityTab customer={customer} activity={activity} onChange={refresh} />
      )}

      {showDelete && (
        <Modal title="Delete customer?" onClose={() => setShowDelete(false)}>
          <p>
            This permanently deletes <strong>{customer.name}</strong>'s record. Their pets,
            bookings, invoices, and activity history are not deleted automatically.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowDelete(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete}>
              Delete customer
            </button>
          </div>
        </Modal>
      )}

      {showEdit && (
        <EditCustomerModal
          customer={customer}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            setAlarmInstructions(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function OverviewTab({
  customer,
  alarmInstructions,
  onRevealAlarm,
}: {
  customer: Customer;
  alarmInstructions: string | null;
  onRevealAlarm: () => void;
}) {
  return (
    <div className="card">
      <div className="section-title">Client details</div>
      <dl className="kv-grid">
        <dt>Email</dt>
        <dd>{customer.email}</dd>
        <dt>Mobile</dt>
        <dd>{customer.mobile || '—'}</dd>
        <dt>Telephone</dt>
        <dd>{customer.telephone || '—'}</dd>
        <dt>Address</dt>
        <dd>{customer.address || '—'}</dd>
      </dl>

      {customer.emergencyContact && (
        <>
          <div className="section-title">Emergency contact</div>
          <dl className="kv-grid">
            <dt>Same as client</dt>
            <dd>{customer.emergencyContact.sameAsClient ? 'Yes' : 'No'}</dd>
            {!customer.emergencyContact.sameAsClient && (
              <>
                <dt>Name</dt>
                <dd>{customer.emergencyContact.name || '—'}</dd>
                <dt>Address</dt>
                <dd>{customer.emergencyContact.address || '—'}</dd>
              </>
            )}
            <dt>Telephone</dt>
            <dd>{customer.emergencyContact.telephone || '—'}</dd>
            <dt>Mobile</dt>
            <dd>{customer.emergencyContact.mobile || '—'}</dd>
          </dl>
        </>
      )}

      {customer.emergencyVet && (
        <>
          <div className="section-title">Emergency vet</div>
          <dl className="kv-grid">
            <dt>Practice</dt>
            <dd>{customer.emergencyVet.practiceName}</dd>
            <dt>Address</dt>
            <dd>{customer.emergencyVet.address}</dd>
            <dt>Telephone</dt>
            <dd>{customer.emergencyVet.telephone}</dd>
            <dt>Alt. care OK</dt>
            <dd>{customer.emergencyVet.alternativeVetAuthorised ? 'Authorised' : 'Not authorised'}</dd>
          </dl>
        </>
      )}

      {customer.security && (
        <>
          <div className="section-title">Security</div>
          <dl className="kv-grid">
            <dt>Keys provided</dt>
            <dd>{customer.security.keysProvided ? 'Yes' : 'No'}</dd>
            <dt>Alarm instructions</dt>
            <dd>
              {alarmInstructions ?? (
                <button className="btn-link" onClick={onRevealAlarm}>
                  Reveal
                </button>
              )}
            </dd>
            <dt>Further info</dt>
            <dd>{customer.security.furtherInformation || '—'}</dd>
          </dl>
        </>
      )}

      {customer.agreement?.signedName && (
        <>
          <div className="section-title">Agreement</div>
          <dl className="kv-grid">
            <dt>Signed by</dt>
            <dd>{customer.agreement.signedName}</dd>
            <dt>Signed at</dt>
            <dd>{customer.agreement.signedAt ? new Date(customer.agreement.signedAt).toLocaleString() : '—'}</dd>
          </dl>
        </>
      )}
    </div>
  );
}

function PetsTab({ animals, onChange }: { animals: Animal[]; onChange: () => void }) {
  const [editing, setEditing] = useState<Animal | null>(null);

  if (animals.length === 0) return <div className="empty-state">No pets registered yet.</div>;
  return (
    <div className="card" style={{ padding: 0 }}>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Species</th>
            <th>Breed</th>
            <th>Sex</th>
            <th>Age</th>
            <th>Vaccinated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {animals.map((a) => (
            <tr key={a._id} onClick={() => setEditing(a)}>
              <td>{a.name}</td>
              <td>{a.species}</td>
              <td>{a.breed}</td>
              <td>{a.sex}</td>
              <td>{a.age}</td>
              <td>{a.vaccinated ? 'Yes' : 'No'}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <button className="btn-link" onClick={() => setEditing(a)}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <EditAnimalModal
          animal={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChange();
          }}
        />
      )}
    </div>
  );
}

function BookingsTab({
  customer,
  animals,
  bookings,
  onChange,
}: {
  customer: Customer;
  animals: Animal[];
  bookings: Booking[];
  onChange: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)} disabled={animals.length === 0}>
          New booking
        </button>
      </div>
      {bookings.length === 0 ? (
        <div className="empty-state">No bookings yet.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b._id}>
                  <td style={{ textTransform: 'capitalize' }}>{b.serviceType}</td>
                  <td>
                    {new Date(b.startDate).toLocaleDateString()} – {new Date(b.endDate).toLocaleDateString()}
                  </td>
                  <td>
                    <Badge value={b.status} />
                  </td>
                  <td>{b.price != null ? `£${b.price.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showNew && (
        <NewBookingModal
          customer={customer}
          animals={animals}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            onChange();
          }}
        />
      )}
    </div>
  );
}

function NewBookingModal({
  customer,
  animals,
  onClose,
  onCreated,
}: {
  customer: Customer;
  animals: Animal[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [selectedAnimals, setSelectedAnimals] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState('boarding');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleAnimal(id: string) {
    setSelectedAnimals((s) => (s.includes(id) ? s.filter((a) => a !== id) : [...s, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedAnimals.length === 0) {
      setError('Select at least one pet.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createBooking({
        customer: customer._id,
        animals: selectedAnimals,
        serviceType,
        startDate,
        endDate,
        notes: notes || undefined,
        price: price ? Number(price) : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New booking" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Pets</label>
          {animals.map((a) => (
            <label key={a._id} style={{ display: 'block', fontWeight: 400, marginBottom: 4 }}>
              <input
                type="checkbox"
                checked={selectedAnimals.includes(a._id)}
                onChange={() => toggleAnimal(a._id)}
                style={{ marginRight: 8 }}
              />
              {a.name} ({a.species})
            </label>
          ))}
        </div>
        <div className="field">
          <label>Service type</label>
          <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
            <option value="boarding">Boarding</option>
            <option value="daycare">Daycare</option>
            <option value="grooming">Grooming</option>
            <option value="walking">Walking</option>
          </select>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label>Price (£)</label>
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create booking'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InvoicesTab({
  customer,
  invoices,
  onChange,
}: {
  customer: Customer;
  invoices: Invoice[];
  onChange: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          New invoice
        </button>
      </div>
      {invoices.length === 0 ? (
        <div className="empty-state">No invoices yet.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Total</th>
                <th>Status</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv._id}>
                  <td>{inv.invoiceNumber}</td>
                  <td>£{inv.total.toFixed(2)}</td>
                  <td>
                    <Badge value={inv.status} />
                  </td>
                  <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showNew && (
        <NewInvoiceModal
          customer={customer}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            onChange();
          }}
        />
      )}
    </div>
  );
}

function NewInvoiceModal({
  customer,
  onClose,
  onCreated,
}: {
  customer: Customer;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [lineItems, setLineItems] = useState([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [tax, setTax] = useState('0');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateItem(i: number, patch: Partial<(typeof lineItems)[number]>) {
    setLineItems((items) => items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }
  function addItem() {
    setLineItems((items) => [...items, { description: '', quantity: 1, unitPrice: 0 }]);
  }
  function removeItem(i: number) {
    setLineItems((items) => items.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createInvoice({
        customer: customer._id,
        lineItems,
        tax: Number(tax) || 0,
        issueDate,
        dueDate,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New invoice" onClose={onClose} wide>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Line items</label>
          {lineItems.map((item, i) => (
            <div className="line-item-row" key={i}>
              <input
                type="text"
                placeholder="Description"
                value={item.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
                required
              />
              <input
                type="number"
                min="0"
                step="1"
                value={item.quantity}
                onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.unitPrice}
                onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                required
              />
              <button type="button" className="remove-btn" onClick={() => removeItem(i)} disabled={lineItems.length === 1}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn-link" onClick={addItem}>
            + Add line item
          </button>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Tax (£)</label>
            <input type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Issue date</label>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create invoice'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ActivityTab({
  customer,
  activity,
  onChange,
}: {
  customer: Customer;
  activity: CrmActivity[];
  onChange: () => void;
}) {
  const { staff } = useAuth();
  const [type, setType] = useState('note');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createActivity({
        customer: customer._id,
        type,
        subject,
        description: description || undefined,
        createdBy: staff?.name ?? 'Staff',
      });
      setSubject('');
      setDescription('');
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add activity');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="card">
        <div className="section-title">Add activity</div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field-row">
            <div className="field">
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="note">Note</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="task">Task</option>
              </select>
            </div>
            <div className="field">
              <label>Subject</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-sm" type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add activity'}
          </button>
        </form>
      </div>

      {activity.length === 0 ? (
        <div className="empty-state">No activity logged yet.</div>
      ) : (
        <div className="card">
          {activity.map((a) => (
            <div key={a._id} style={{ padding: '10px 0', borderBottom: '1px solid #eef1f2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{a.subject}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                {a.type} · {a.createdBy}
              </div>
              {a.description && <div style={{ marginTop: 4 }}>{a.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
