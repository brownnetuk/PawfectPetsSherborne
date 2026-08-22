import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/client';
import ActionsMenu from '../components/ActionsMenu';
import Badge from '../components/Badge';
import DocumentFormModal from '../components/DocumentFormModal';
import EditAnimalModal from '../components/EditAnimalModal';
import EditBookingModal from '../components/EditBookingModal';
import EditCustomerModal from '../components/EditCustomerModal';
import { PencilIcon, TrashIcon } from '../components/icons';
import IncomeChart from '../components/IncomeChart';
import Modal from '../components/Modal';
import AddPetChoiceModal from '../components/AddPetChoiceModal';
import NewAnimalModal from '../components/NewAnimalModal';
import ViewAnimalModal from '../components/ViewAnimalModal';
import { buildCustomerFormPdf } from '../pdf/customerFormPdf';
import type {
  ActivityType,
  Animal,
  AuditLogEntry,
  Booking,
  Customer,
  CustomerStatus,
  CrmActivity,
  IncomeMonth,
  Invoice,
} from '../types';
import { useAuth } from '../auth/AuthContext';

const INTAKE_URL = import.meta.env.VITE_INTAKE_URL ?? 'http://localhost:5173';

const CUSTOMER_STATUSES: CustomerStatus[] = ['pending', 'active', 'inactive', 'update_info'];

function statusLabel(status: string): string {
  const words = status.split('_');
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

type Tab = 'overview' | 'pets' | 'bookings' | 'invoices' | 'activity' | 'log';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activity, setActivity] = useState<CrmActivity[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [incomeMonths, setIncomeMonths] = useState<IncomeMonth[]>([]);
  const [incomePeriod, setIncomePeriod] = useState(6);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState<string | null>(null);
  const [alarmInstructions, setAlarmInstructions] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; message: string } | null>(null);

  function refresh() {
    if (!id) return;
    api.getCustomer(id).then(setCustomer).catch((err) => setError(err.message));
    api.listAnimals(id).then(setAnimals).catch(() => {});
    api.listBookings(id).then(setBookings).catch(() => {});
    api.listInvoices(id).then(setInvoices).catch(() => {});
    api.listActivities(id).then(setActivity).catch(() => {});
    api.listAuditLog(id).then(setAuditLog).catch(() => {});
  }

  useEffect(refresh, [id]);

  useEffect(() => {
    if (!id) return;
    api.getIncomeChart(id, incomePeriod).then(setIncomeMonths).catch(() => {});
  }, [id, incomePeriod]);

  if (!id) return null;
  if (error) return <div className="error-banner">{error}</div>;
  if (!customer) return <div className="empty-state">Loading…</div>;

  const intakeLink = `${INTAKE_URL}/intake/${customer._id}`;

  async function sendLinkEmail() {
    if (!customer) return;
    setSendingEmail(true);
    setEmailResult(null);
    try {
      const trigger = customer.status === 'update_info' ? 'update_info' : 'registration';
      await api.sendTriggeredEmail(trigger, customer.email, customer.name, intakeLink);
      setEmailResult({ ok: true, message: `Email sent to ${customer.email}.` });
    } catch (err) {
      setEmailResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to send email' });
    } finally {
      setSendingEmail(false);
    }
  }

  async function revealAlarm() {
    if (!id) return;
    const value = await api.getAlarmInstructions(id);
    setAlarmInstructions(value ?? '(none provided)');
  }

  async function handleDelete() {
    if (!id) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteCustomer(id);
      navigate('/customers');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete customer');
    } finally {
      setDeleting(false);
    }
  }

  async function handleViewPdf() {
    if (!id || !customer) return;
    setShowPdf(true);
    setPdfLoading(true);
    setPdfError(null);
    try {
      const alarm = await api.getAlarmInstructions(id).catch(() => null);
      const termsHtml = await api
        .getBusinessInfo()
        .then((info) => info.termsHtml)
        .catch(() => '');
      const doc = await buildCustomerFormPdf(customer, animals, alarm, termsHtml);
      const url = URL.createObjectURL(doc.output('blob'));
      setPdfUrl(url);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to generate the PDF');
    } finally {
      setPdfLoading(false);
    }
  }

  function closePdf() {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setPdfError(null);
    setShowPdf(false);
  }

  async function handleStatusChange(status: string) {
    if (!id) return;
    await api.updateCustomerStatus(id, status);
    refresh();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{customer.name}</h1>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`badge badge-${customer.status}`}>
              <select value={customer.status} onChange={(e) => handleStatusChange(e.target.value)}>
                {CUSTOMER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <ActionsMenu
            items={[
              ...(customer.status === 'pending' || customer.status === 'update_info'
                ? [
                    {
                      label: sendingEmail ? 'Sending…' : 'Send email',
                      onClick: sendLinkEmail,
                      disabled: sendingEmail,
                    },
                  ]
                : []),
              { label: pdfLoading ? 'Preparing…' : 'View', onClick: handleViewPdf, disabled: pdfLoading },
              { label: 'Edit', onClick: () => setShowEdit(true) },
              {
                label: 'Delete',
                onClick: () => {
                  setDeleteError(null);
                  setShowDelete(true);
                },
                danger: true,
                dividerBefore: true,
              },
            ]}
          />
        </div>
      </div>

      {emailResult && (
        <div
          className={emailResult.ok ? undefined : 'error-banner'}
          style={
            emailResult.ok
              ? {
                  background: 'var(--sage-badge)',
                  color: 'var(--brand-green)',
                  padding: '10px 14px',
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: '0.88rem',
                  fontWeight: 500,
                }
              : undefined
          }
        >
          {emailResult.message}
        </div>
      )}

      <div className="tabs">
        {(['overview', 'pets', 'bookings', 'invoices', 'activity', 'log'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'pets'
              ? `Pets (${animals.length})`
              : t === 'activity'
                ? 'Notes'
                : t === 'log'
                  ? 'Activity'
                  : t.charAt(0).toUpperCase() + t.slice(1)}
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
      {tab === 'pets' && <PetsTab customer={customer} animals={animals} onChange={refresh} />}
      {tab === 'bookings' && (
        <BookingsTab customer={customer} animals={animals} bookings={bookings} onChange={refresh} />
      )}
      {tab === 'invoices' && (
        <InvoicesTab customer={customer} invoices={invoices} onChange={refresh} />
      )}
      {tab === 'activity' && (
        <ActivityTab customer={customer} activity={activity} onChange={refresh} />
      )}
      {tab === 'log' && (
        <AuditLogTab
          entries={auditLog}
          incomeMonths={incomeMonths}
          incomePeriod={incomePeriod}
          onPeriodChange={setIncomePeriod}
        />
      )}

      {showDelete && (
        <Modal title="Delete customer?" onClose={() => setShowDelete(false)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently deletes <strong>{customer.name}</strong>'s record. If they still have
            pets, bookings, invoices, quotes, or CRM activity on file, deletion is blocked until
            those are removed first.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowDelete(false)} disabled={deleting}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete customer'}
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

      {showPdf && (
        <Modal title={`${customer.name} — Registration form`} onClose={closePdf} xl>
          {pdfError && <div className="error-banner">{pdfError}</div>}
          {pdfLoading && !pdfUrl && !pdfError && (
            <div className="empty-state">Preparing the form…</div>
          )}
          {pdfUrl && (
            <iframe
              src={pdfUrl}
              title="Registration form PDF"
              style={{ width: '100%', height: '75vh', border: '1px solid var(--border)', borderRadius: 8 }}
            />
          )}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={closePdf}>
              Close
            </button>
            {pdfUrl && (
              <a
                href={pdfUrl}
                download={`${customer.name.replace(/\s+/g, '-')}-registration-form.pdf`}
                className="btn btn-primary"
              >
                Download
              </a>
            )}
          </div>
        </Modal>
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
    <>
      <div className="card">
        <div className="section-title">Client details</div>
        <dl className="kv-grid">
          <dt>Name</dt>
          <dd>{customer.name}</dd>
          <dt>Address</dt>
          <dd>{customer.address || '—'}</dd>
          <dt>Phone number</dt>
          <dd>{customer.phoneNumber || '—'}</dd>
          <dt>Email</dt>
          <dd>{customer.email}</dd>
        </dl>
      </div>

      {customer.emergencyContact && (
        <div className="card">
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
            <dt>Phone number</dt>
            <dd>{customer.emergencyContact.phoneNumber || '—'}</dd>
          </dl>
        </div>
      )}

      {customer.emergencyVet && (
        <div className="card">
          <div className="section-title">Emergency vet</div>
          <dl className="kv-grid">
            <dt>Practice</dt>
            <dd>{customer.emergencyVet.practiceName}</dd>
            <dt>Address</dt>
            <dd>{customer.emergencyVet.address}</dd>
            <dt>Telephone</dt>
            <dd>{customer.emergencyVet.telephone}</dd>
            <dt>Alt. care authorisation</dt>
            <dd>
              {customer.emergencyVet.authorisation?.signedName
                ? `Signed by ${customer.emergencyVet.authorisation.signedName}${
                    customer.emergencyVet.authorisation.signedAt
                      ? ` on ${new Date(customer.emergencyVet.authorisation.signedAt).toLocaleDateString('en-GB')}`
                      : ''
                  }`
                : 'Not yet signed'}
            </dd>
          </dl>
        </div>
      )}

      {customer.security && (
        <div className="card">
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
        </div>
      )}

      {customer.agreement?.signedName && (
        <div className="card">
          <div className="section-title">Agreement</div>
          <dl className="kv-grid">
            <dt>Signed by</dt>
            <dd>{customer.agreement.signedName}</dd>
            <dt>Signed at</dt>
            <dd>{customer.agreement.signedAt ? new Date(customer.agreement.signedAt).toLocaleString() : '—'}</dd>
          </dl>
        </div>
      )}
    </>
  );
}

function PetsTab({
  customer,
  animals,
  onChange,
}: {
  customer: Customer;
  animals: Animal[];
  onChange: () => void;
}) {
  const customerId = customer._id;
  const [viewing, setViewing] = useState<Animal | null>(null);
  const [editing, setEditing] = useState<Animal | null>(null);
  const [showChoice, setShowChoice] = useState(false);
  const [showNew, setShowNew] = useState(false);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowChoice(true)}>
          New pet
        </button>
      </div>
      {animals.length === 0 ? (
        <div className="empty-state">No pets registered yet.</div>
      ) : (
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
                <tr key={a._id} onClick={() => setViewing(a)}>
                  <td>{a.name}</td>
                  <td>{a.species}</td>
                  <td>{a.breed}</td>
                  <td>{a.sex}</td>
                  <td>{a.age}</td>
                  <td>{a.vaccinated ? 'Yes' : 'No'}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 12 }}>
                    <button className="btn-link" onClick={() => setViewing(a)}>
                      View
                    </button>
                    <button className="btn-link" onClick={() => setEditing(a)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showChoice && (
        <AddPetChoiceModal
          customerId={customerId}
          customerName={customer.name}
          customerEmail={customer.email}
          onClose={() => setShowChoice(false)}
          onChooseManual={() => {
            setShowChoice(false);
            setShowNew(true);
          }}
        />
      )}
      {showNew && (
        <NewAnimalModal
          customerId={customerId}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            onChange();
          }}
        />
      )}
      {viewing && <ViewAnimalModal animal={viewing} onClose={() => setViewing(null)} />}
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
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [deletingBooking, setDeletingBooking] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!deletingBooking) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteBooking(deletingBooking._id);
      setDeletingBooking(null);
      onChange();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete booking');
    } finally {
      setDeleting(false);
    }
  }

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
                <th></th>
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
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="icon-btn" title="Edit" onClick={() => setEditingBooking(b)}>
                        <PencilIcon />
                      </button>
                      <button
                        className="icon-btn icon-btn-danger"
                        title="Delete"
                        onClick={() => {
                          setDeleteError(null);
                          setDeletingBooking(b);
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
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
      {editingBooking && (
        <EditBookingModal
          booking={editingBooking}
          onClose={() => setEditingBooking(null)}
          onSaved={() => {
            setEditingBooking(null);
            onChange();
          }}
        />
      )}
      {deletingBooking && (
        <Modal title="Delete booking?" onClose={() => setDeletingBooking(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>This permanently deletes this booking. If an invoice or quote is linked to it,
            deletion is blocked until those are removed first.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeletingBooking(null)} disabled={deleting}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete booking'}
            </button>
          </div>
        </Modal>
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
        <DocumentFormModal
          kind="invoice"
          existing={null}
          presetCustomerId={customer._id}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            onChange();
          }}
        />
      )}
    </div>
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
      setError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="card">
        <div className="section-title">Add note</div>
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
            {submitting ? 'Adding…' : 'Add note'}
          </button>
        </form>
      </div>

      {activity.length === 0 ? (
        <div className="empty-state">No notes logged yet.</div>
      ) : (
        <div className="card">
          {activity.map((a) => (
            <ActivityItem key={a._id} activity={a} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityItem({ activity, onChange }: { activity: CrmActivity; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [type, setType] = useState(activity.type);
  const [subject, setSubject] = useState(activity.subject);
  const [description, setDescription] = useState(activity.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!subject.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.updateActivity(activity._id, {
        type,
        subject,
        description: description || undefined,
      });
      setEditing(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    await api.deleteActivity(activity._id);
    onChange();
  }

  if (editing) {
    return (
      <div style={{ padding: '10px 0', borderBottom: '1px solid #eef1f2' }}>
        {error && <div className="error-banner">{error}</div>}
        <div className="field-row">
          <div className="field">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #eef1f2' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <strong>{activity.subject}</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginRight: 6 }}>
            {new Date(activity.createdAt).toLocaleString()}
          </span>
          <button className="icon-btn" title="Edit" onClick={() => setEditing(true)}>
            <PencilIcon />
          </button>
          <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setShowDelete(true)}>
            <TrashIcon />
          </button>
        </div>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        {activity.type} · {activity.createdBy}
      </div>
      {activity.description && <div style={{ marginTop: 4 }}>{activity.description}</div>}

      {showDelete && (
        <Modal title="Delete note?" onClose={() => setShowDelete(false)}>
          <p>This permanently deletes this note.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setShowDelete(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete}>
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// The "Activity" tab -- an automatic, system-generated audit trail (see
// AuditLogEntry in types.ts), distinct from the "Notes" tab (ActivityTab/
// ActivityItem above, which is the manually-authored CrmActivity log). Staff
// never write to this one directly; it's just a read-only feed of things
// that happened, fed by CustomerDetailPage's own eager-fetch-on-mount
// (api.listAuditLog/api.getIncomeChart), same pattern the other tabs use.
function AuditLogTab({
  entries,
  incomeMonths,
  incomePeriod,
  onPeriodChange,
}: {
  entries: AuditLogEntry[];
  incomeMonths: IncomeMonth[];
  incomePeriod: number;
  onPeriodChange: (months: number) => void;
}) {
  const totalIncome = incomeMonths.reduce((sum, m) => sum + m.total, 0);

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Income</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
              Payments received from this customer over time.
            </p>
          </div>
          <select value={incomePeriod} onChange={(e) => onPeriodChange(Number(e.target.value))} style={{ width: 'auto' }}>
            <option value={6}>Last 6 Months</option>
            <option value={12}>Last 12 Months</option>
          </select>
        </div>
        <IncomeChart data={incomeMonths} />
        <div style={{ fontWeight: 600 }}>
          Total Income ( Last {incomePeriod} Months ) - £{totalIncome.toFixed(2)}
        </div>
      </div>

      <div className="card">
        <h2>Activity</h2>
        {entries.length === 0 ? (
          <div className="empty-state">No activity recorded yet.</div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 2, background: 'var(--border)' }} />
            {entries.map((e) => (
              <div key={e._id} style={{ position: 'relative', paddingBottom: 20 }}>
                <div
                  style={{
                    position: 'absolute',
                    left: -20,
                    top: 4,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    border: '2px solid white',
                    boxShadow: '0 0 0 1px var(--border)',
                  }}
                />
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                  {new Date(e.createdAt).toLocaleDateString()} {new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="card" style={{ marginTop: 4, padding: '12px 14px' }}>
                  <div style={{ fontWeight: 600 }}>{e.title}</div>
                  {e.description && (
                    <div style={{ fontSize: '0.88rem', color: 'var(--muted)', marginTop: 2 }}>{e.description}</div>
                  )}
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>by {e.actor}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
