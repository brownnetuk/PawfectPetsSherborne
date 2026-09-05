import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as api from '../api/client';
import ActionsMenu from '../components/ActionsMenu';
import Badge from '../components/Badge';
import DocumentFormModal from '../components/DocumentFormModal';
import EditAnimalModal from '../components/EditAnimalModal';
import EditCustomerModal from '../components/EditCustomerModal';
import { PencilIcon, TrashIcon } from '../components/icons';
import IncomeChart from '../components/IncomeChart';
import Modal from '../components/Modal';
import AddPetChoiceModal from '../components/AddPetChoiceModal';
import FormPreviewModal from '../components/FormPreviewModal';
import NewAnimalModal from '../components/NewAnimalModal';
import NewBookingModal from '../components/NewBookingModal';
import RegistrationLinkModal from '../components/RegistrationLinkModal';
import SendFormModal from '../components/SendFormModal';
import ViewAnimalModal from '../components/ViewAnimalModal';
import ViewFormSubmissionModal from '../components/ViewFormSubmissionModal';
import { buildCustomerFormPdf } from '../pdf/customerFormPdf';
import type {
  ActivityType,
  Animal,
  AnnualLeave,
  AuditLogEntry,
  Customer,
  CustomerStatus,
  CrmActivity,
  DayBooking,
  FormRecord,
  FormSubmissionRecord,
  IncomeMonth,
  Invoice,
  Product,
  VisitMapping,
} from '../types';
import { addDays, dateKey } from '../utils/visitPlan';
import { isVisitProduct, visitCountForProduct } from '../utils/visitMapping';
import { WEEKDAYS } from '../types';
import { useAuth } from '../auth/AuthContext';

const INTAKE_URL = import.meta.env.VITE_INTAKE_URL ?? 'http://localhost:5173';

const CUSTOMER_STATUSES: CustomerStatus[] = ['pending', 'active', 'inactive', 'update_info'];

function statusLabel(status: string): string {
  const words = status.split('_');
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// A partial payment doesn't change the invoice's underlying status (it stays
// "sent" until fully covered -- see InvoicesService.applyPayment()) -- this
// is purely a derived display badge layered alongside the real status.
// jsPDF's `datauristring` output embeds a non-standard `;filename=...;`
// segment between the media type and `;base64,`, which breaks Chrome's PDF
// viewer when used as an iframe src (it renders a blank page even though the
// same string works fine for a plain <a download> link). Strip it so stored
// snapshots -- old and new -- render correctly.
function toPdfIframeSrc(dataUri: string | undefined): string | undefined {
  return dataUri?.replace(/^data:application\/pdf;filename=[^;]*;base64,/, 'data:application/pdf;base64,');
}

function isPartiallyPaid(inv: Invoice): boolean {
  const paid = inv.amountPaid ?? 0;
  return inv.status === 'sent' && paid > 0 && paid < inv.total;
}

type Tab = 'overview' | 'pets' | 'bookings' | 'invoices' | 'activity' | 'log' | 'forms' | 'defaults';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [animals, setAnimals] = useState<Animal[]>([]);
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
  const [showRequestUpdate, setShowRequestUpdate] = useState(false);
  const [requestingUpdate, setRequestingUpdate] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState<AuditLogEntry | null>(null);

  function refresh() {
    if (!id) return;
    api.getCustomer(id).then(setCustomer).catch((err) => setError(err.message));
    api.listAnimals(id).then(setAnimals).catch(() => {});
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

  // Shared by "View" and the post-send snapshot logging below -- same PDF,
  // just a different destination for the result (an object URL to display
  // vs. a base64 data URI to store).
  async function generateFormPdfDoc() {
    if (!id || !customer) return null;
    const alarm = await api.getAlarmInstructions(id).catch(() => null);
    const businessInfo = await api.getBusinessInfo().catch(() => null);
    return buildCustomerFormPdf(
      customer,
      animals,
      alarm,
      businessInfo?.termsHtml ?? '',
      businessInfo?.emergencyVetAuthorisationText ?? '',
      businessInfo?.offLeadConsentText ?? '',
      businessInfo?.declarationText ?? '',
    );
  }

  // Attaches a snapshot of the registration form, as it stands right now, to
  // an Activity entry -- called right after successfully emailing the
  // customer their link, so staff can see what was actually on file (and
  // sent) at that point, not just what the record looks like today.
  // `entryId`, when given, is the "sent" entry SettingsService.
  // sendTriggeredEmail already created (with its tracking pixel embedded) --
  // the snapshot attaches there instead of creating a second entry; `title`
  // is the fallback for when there's no entryId to attach to. Best-effort:
  // a failure here shouldn't make the email send itself look like it
  // failed, so this never throws back to its caller.
  async function snapshotFormToActivity(title: string, entryId?: string) {
    if (!id || !customer) return;
    try {
      const doc = await generateFormPdfDoc();
      if (!doc) return;
      const attachmentData = doc.output('datauristring');
      const attachmentName = `${customer.name.replace(/[^a-z0-9]+/gi, '-')}-registration-form.pdf`;
      await api.logFormSnapshot(id, title, attachmentData, attachmentName, entryId);
      refresh();
    } catch {
      // Logging the snapshot is a nice-to-have on top of a send that already
      // succeeded -- never surface this as if the email itself failed.
    }
  }

  async function sendLinkEmail() {
    if (!customer) return;
    setSendingEmail(true);
    setEmailResult(null);
    try {
      const isUpdate = customer.status === 'update_info';
      const { entryId } = await api.sendTriggeredEmail(
        isUpdate ? 'update_info' : 'registration',
        customer.email,
        customer.name,
        intakeLink,
        customer._id,
      );
      setEmailResult({ ok: true, message: `Email sent to ${customer.email}.` });
      await snapshotFormToActivity(isUpdate ? 'Update request email sent' : 'Registration email sent', entryId);
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
      const doc = await generateFormPdfDoc();
      if (!doc) return;
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

  // Moves the customer to "Update Info" (logged server-side -- see
  // CustomersService.updateStatus) and then shows the same send/copy-link
  // screen used for a fresh registration, just worded for a returning
  // customer. The intake form itself already pre-fills from what's on file
  // when opened via this same link, so there's nothing extra to pass here.
  async function handleRequestUpdate() {
    if (!id) return;
    setRequestingUpdate(true);
    try {
      await api.updateCustomerStatus(id, 'update_info');
      refresh();
      setShowRequestUpdate(true);
    } finally {
      setRequestingUpdate(false);
    }
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
              // Not offered for 'pending' (nothing on file yet to update -- "Send
              // email" above covers that first-time link) or 'update_info' (an
              // update's already been requested; "Send email" above resends the
              // same link without a redundant second way to do the same thing).
              ...(customer.status === 'active' || customer.status === 'inactive'
                ? [
                    {
                      label: requestingUpdate ? 'Requesting…' : 'Request Update',
                      onClick: handleRequestUpdate,
                      disabled: requestingUpdate,
                    },
                  ]
                : []),
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
        {(['defaults', 'overview', 'pets', 'bookings', 'invoices', 'activity', 'log', 'forms'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'pets'
              ? `Pets (${animals.length})`
              : t === 'activity'
                ? 'Notes'
                : t === 'log'
                  ? 'Activity'
                  : t === 'defaults'
                    ? 'Customer Defaults'
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
        <BookingsTab customer={customer} animals={animals} />
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
          onViewAttachment={setViewingSnapshot}
        />
      )}
      {tab === 'forms' && <FormSubmissionsTab customer={customer} />}
      {tab === 'defaults' && <CustomerDefaultsTab customer={customer} onChange={refresh} />}

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

      {showRequestUpdate && (
        <RegistrationLinkModal
          name={customer.name}
          email={customer.email}
          link={intakeLink}
          customerId={customer._id}
          trigger="update_info"
          onEmailSent={(entryId) => snapshotFormToActivity('Update request email sent', entryId)}
          onDone={() => setShowRequestUpdate(false)}
        />
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

      {viewingSnapshot && (
        <Modal
          title={`${customer.name} — Registration form (${new Date(viewingSnapshot.createdAt).toLocaleDateString('en-GB')} snapshot)`}
          onClose={() => setViewingSnapshot(null)}
          xl
        >
          <iframe
            src={toPdfIframeSrc(viewingSnapshot.attachmentData)}
            title="Registration form PDF snapshot"
            style={{ width: '100%', height: '75vh', border: '1px solid var(--border)', borderRadius: 8 }}
          />
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setViewingSnapshot(null)}>
              Close
            </button>
            <a
              href={viewingSnapshot.attachmentData}
              download={viewingSnapshot.attachmentName || 'registration-form.pdf'}
              className="btn btn-primary"
            >
              Download
            </a>
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
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <dl className="kv-grid" style={{ flex: 1, minWidth: 220 }}>
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
            {customer.emergencyVet.authorisation?.signatureImage && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 8,
                  width: 220,
                  height: 90,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <img
                  src={customer.emergencyVet.authorisation.signatureImage}
                  alt="Alt. care authorisation signature"
                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {customer.security && (
        <div className="card">
          <div className="section-title">Security</div>
          <dl className="kv-grid">
            <dt>Keys provided</dt>
            <dd>{customer.security.keysProvided ? 'Yes' : 'No'}</dd>
            <dt>Alarm/KeySafe Code</dt>
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
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <dl className="kv-grid" style={{ flex: 1, minWidth: 220 }}>
              <dt>Signed by</dt>
              <dd>{customer.agreement.signedName}</dd>
              <dt>Signed at</dt>
              <dd>{customer.agreement.signedAt ? new Date(customer.agreement.signedAt).toLocaleString() : '—'}</dd>
              <dt>Version</dt>
              <dd>{customer.agreement.termsVersion || '—'}</dd>
              <dt>Document date</dt>
              <dd>{customer.agreement.termsDocumentDate || '—'}</dd>
            </dl>
            {customer.agreement.signatureImage && (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 8,
                  width: 220,
                  height: 90,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <img
                  src={customer.agreement.signatureImage}
                  alt="Client signature"
                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                />
              </div>
            )}
          </div>
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
  const [deletingAnimal, setDeletingAnimal] = useState<Animal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!deletingAnimal) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAnimal(deletingAnimal._id);
      setDeletingAnimal(null);
      onChange();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete pet');
    } finally {
      setDeleting(false);
    }
  }

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
                <th></th>
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
                  <td style={{ width: 44 }}>
                    {a.photos?.[0] && (
                      <img
                        src={a.photos[0]}
                        alt={a.name}
                        style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                      />
                    )}
                  </td>
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
                    <button
                      className="btn-link"
                      style={{ color: 'var(--error)' }}
                      onClick={() => {
                        setDeleteError(null);
                        setDeletingAnimal(a);
                      }}
                    >
                      Delete
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
      {deletingAnimal && (
        <Modal title="Delete pet?" onClose={() => setDeletingAnimal(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently deletes {deletingAnimal.name}'s record. If they're on any bookings,
            deletion is blocked until those are removed first.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeletingAnimal(null)} disabled={deleting}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete pet'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function dbAnimalId(animal: DayBooking['animal']): string {
  return typeof animal === 'string' ? animal : animal._id;
}
function dbAnimalLabel(animal: DayBooking['animal']): string {
  return typeof animal === 'string' ? animal : animal.name;
}
function dbProductId(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product._id;
}
function dbProductLabel(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product.name;
}

interface DateGroup {
  key: string;
  date: Date;
  walks: DayBooking[];
  visits: DayBooking[];
}

// Matches the Bookings calendar page: staff should see and add this
// customer's Walks/Visits the same way here as they would from the Bookings
// page's day panel, rather than the old boarding-style Booking model this
// tab used to show.
function BookingsTab({ customer, animals }: { customer: Customer; animals: Animal[] }) {
  const [dayBookings, setDayBookings] = useState<DayBooking[] | null>(null);
  const [visitMapping, setVisitMapping] = useState<VisitMapping | null>(null);
  const [annualLeave, setAnnualLeave] = useState<AnnualLeave[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    api
      .listDayBookingsForCustomer(customer._id)
      .then(setDayBookings)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bookings'));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [customer._id]);

  useEffect(() => {
    api.getVisitMapping().then(setVisitMapping).catch(() => {});
    api.listAnnualLeave().then(setAnnualLeave).catch(() => {});
  }, []);

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.deleteDayBooking(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove this entry');
    }
  }

  // Keyed by animal+day so a 1-visit entry's AM/PM can be inferred the same
  // way the Bookings page does (start of a run = PM, end = AM) when it has
  // no explicit visitTime stored -- this tab already has this customer's
  // whole history loaded, so no extra fetch is needed to see either side.
  const visitByAnimalDate = new Map<string, DayBooking>();
  if (dayBookings && visitMapping) {
    for (const b of dayBookings) {
      if (isVisitProduct(visitMapping, dbProductId(b.product))) {
        visitByAnimalDate.set(`${dbAnimalId(b.animal)}|${dateKey(new Date(b.date))}`, b);
      }
    }
  }
  function visitTimeFor(b: DayBooking, date: Date): 'AM' | 'PM' {
    if (b.visitTime) return b.visitTime;
    const aid = dbAnimalId(b.animal);
    const isStart = !visitByAnimalDate.has(`${aid}|${dateKey(addDays(date, -1))}`);
    const isEnd = !visitByAnimalDate.has(`${aid}|${dateKey(addDays(date, 1))}`);
    return isEnd && !isStart ? 'AM' : 'PM';
  }

  const groups: DateGroup[] = [];
  if (dayBookings && visitMapping) {
    const byDate = new Map<string, DateGroup>();
    for (const b of dayBookings) {
      const date = new Date(b.date);
      const key = dateKey(date);
      let g = byDate.get(key);
      if (!g) {
        g = { key, date, walks: [], visits: [] };
        byDate.set(key, g);
      }
      if (isVisitProduct(visitMapping, dbProductId(b.product))) g.visits.push(b);
      else g.walks.push(b);
    }
    groups.push(...Array.from(byDate.values()).sort((a, b) => a.key.localeCompare(b.key)));
  }

  function Row({ b, label }: { b: DayBooking; label?: string }) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 0',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ fontWeight: 600, minWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dbAnimalLabel(b.animal)}
        </span>
        {label && (
          <span
            style={{
              background: 'var(--accent-light)',
              color: 'var(--accent)',
              fontSize: '0.7rem',
              fontWeight: 700,
              borderRadius: 4,
              padding: '2px 6px',
              flexShrink: 0,
            }}
          >
            {label}
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0, color: 'var(--muted)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dbProductLabel(b.product)} × {b.quantity}
        </span>
        {b.invoice && (
          <span title="Invoiced" style={{ color: 'var(--brand-green)', fontSize: '0.85rem', flexShrink: 0 }}>
            ✓
          </span>
        )}
        <button type="button" className="icon-btn icon-btn-danger" title="Remove" style={{ flexShrink: 0 }} onClick={() => handleRemove(b._id)}>
          <TrashIcon />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)} disabled={animals.length === 0}>
          New Booking
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!dayBookings || !visitMapping ? (
        <div className="empty-state">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="empty-state">No bookings yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map((g) => (
            <div key={g.key} className="card">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                {g.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
              {g.walks.length > 0 && (
                <div style={{ marginBottom: g.visits.length > 0 ? 10 : 0 }}>
                  <div className="section-title" style={{ marginTop: 0 }}>
                    Walks
                  </div>
                  {g.walks.map((b) => (
                    <Row key={b._id} b={b} />
                  ))}
                </div>
              )}
              {g.visits.length > 0 && (
                <div>
                  <div className="section-title">Visits</div>
                  {g.visits.map((b) => {
                    const count = visitCountForProduct(visitMapping, dbProductId(b.product));
                    const label = count === 2 ? 'AM & PM' : visitTimeFor(b, g.date);
                    return <Row key={b._id} b={b} label={label} />;
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {showNew && (
        <NewBookingModal
          animals={animals}
          customers={[customer]}
          annualLeave={annualLeave}
          initialCustomerId={customer._id}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}
    </div>
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
                    {isPartiallyPaid(inv) && <span className="badge badge-partially_paid">Partially Paid</span>}
                  </td>
                  <td>{new Date(inv.dueDate).toLocaleDateString('en-GB')}</td>
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
  onViewAttachment,
}: {
  entries: AuditLogEntry[];
  incomeMonths: IncomeMonth[];
  incomePeriod: number;
  onPeriodChange: (months: number) => void;
  onViewAttachment: (entry: AuditLogEntry) => void;
}) {
  const totalIncome = incomeMonths.reduce((sum, m) => sum + m.total, 0);

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div className="card" style={{ flex: 1, minWidth: 0 }}>
        <h2>Activity</h2>
        {entries.length === 0 ? (
          <div className="empty-state">No activity recorded yet.</div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 20, maxHeight: 572, overflowY: 'auto' }}>
            <div style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 2, background: 'var(--border)' }} />
            {entries.map((e) => (
              <div key={e._id} style={{ position: 'relative', paddingBottom: 14 }}>
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
                  {new Date(e.createdAt).toLocaleDateString('en-GB')} {new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {' · by '}
                  {e.actor}
                </div>
                <div className="card" style={{ marginTop: 3, padding: '8px 12px' }}>
                  <div style={{ fontWeight: 600 }}>{e.title}</div>
                  {e.description && (
                    <div
                      style={{ fontSize: '0.88rem', color: 'var(--muted)', marginTop: 2, whiteSpace: 'pre-line' }}
                    >
                      {e.description}
                    </div>
                  )}
                  {e.attachmentData && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                      <button
                        type="button"
                        className="btn-link"
                        style={{ fontSize: '0.8rem' }}
                        onClick={() => onViewAttachment(e)}
                      >
                        View
                      </button>
                      <a
                        href={e.attachmentData}
                        download={e.attachmentName || 'registration-form.pdf'}
                        className="btn-link"
                        style={{ fontSize: '0.8rem' }}
                      >
                        Download PDF
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Income</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
              Payments received from this customer over time.
            </p>
          </div>
          <select className="select-inline" value={incomePeriod} onChange={(e) => onPeriodChange(Number(e.target.value))}>
            <option value={6}>Last 6 Months</option>
            <option value={12}>Last 12 Months</option>
          </select>
        </div>
        <IncomeChart data={incomeMonths} />
        <div style={{ fontWeight: 600 }}>
          Total Income ( Last {incomePeriod} Months ) - £{totalIncome.toFixed(2)}
        </div>
      </div>
    </div>
  );
}

// Deliberately lazy-fetches (unlike this page's other tabs, which are all fed
// from CustomerDetailPage's own eager-fetch-on-mount) -- submissions are
// rarely viewed, so there's no reason to fetch them for every customer page
// load regardless of which tab staff actually open.
function FormSubmissionsTab({ customer }: { customer: Customer }) {
  const [submissions, setSubmissions] = useState<FormSubmissionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<FormSubmissionRecord | null>(null);
  const [forms, setForms] = useState<FormRecord[]>([]);
  const [pickedFormId, setPickedFormId] = useState('');
  const [previewingForm, setPreviewingForm] = useState<FormRecord | null>(null);
  const [sendingForm, setSendingForm] = useState<FormRecord | null>(null);
  const [resendChoice, setResendChoice] = useState<FormSubmissionRecord | null>(null);
  const [resending, setResending] = useState<FormSubmissionRecord | null>(null);
  const [editing, setEditing] = useState<FormSubmissionRecord | null>(null);
  const [deleting, setDeleting] = useState<FormSubmissionRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    api
      .listFormSubmissions(customer._id)
      .then(setSubmissions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load forms'));
  }
  useEffect(refresh, [customer._id]);
  useEffect(() => {
    api.listForms().then(setForms).catch(() => {});
  }, []);

  function statusLabel(status: FormSubmissionRecord['status']): string {
    return status === 'completed' ? 'Completed' : 'Sent — awaiting response';
  }

  // Falls back to a stand-in built from the submission's own snapshot if the
  // Form it was sent from has since been edited-away-from-this-name or
  // deleted entirely -- SendFormModal in resend mode only reads `.name` off
  // this (it reuses the submission's own link rather than generating a new
  // one), so a stand-in is all it needs.
  function formFor(submission: FormSubmissionRecord): FormRecord {
    return (
      forms.find((f) => f._id === submission.form) ?? {
        _id: submission.form,
        name: submission.formName,
        fields: submission.formFieldsSnapshot,
        createdAt: submission.createdAt,
      }
    );
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteFormSubmission(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this submission');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>Forms</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            Forms sent to and filled in by this customer.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="select-inline" value={pickedFormId} onChange={(e) => setPickedFormId(e.target.value)}>
            <option value="">Choose a form…</option>
            {forms
              .filter((f) => f.customerVisible !== false)
              .map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
          </select>
          <button
            className="btn btn-primary btn-sm"
            disabled={!pickedFormId}
            onClick={() => setPreviewingForm(forms.find((f) => f._id === pickedFormId) ?? null)}
          >
            Preview
          </button>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!submissions || submissions.length === 0 ? (
        <div className="empty-state">{submissions === null ? 'Loading…' : 'No forms sent yet.'}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Form</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Submitted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <tr key={s._id} onClick={() => setViewing(s)}>
                <td>{s.formName}</td>
                <td>{statusLabel(s.status)}</td>
                <td>{new Date(s.createdAt).toLocaleDateString('en-GB')}</td>
                <td>{s.submittedAt ? new Date(s.submittedAt).toLocaleDateString('en-GB') : '—'}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <ActionsMenu
                    items={[
                      { label: 'Resend', onClick: () => setResendChoice(s) },
                      { label: 'Edit', onClick: () => setEditing(s) },
                      { label: 'Delete', onClick: () => setDeleting(s), danger: true, dividerBefore: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewing && <ViewFormSubmissionModal submission={viewing} onClose={() => setViewing(null)} />}
      {previewingForm && (
        <FormPreviewModal
          name={previewingForm.name}
          description={previewingForm.description ?? ''}
          fields={previewingForm.fields}
          onClose={() => setPreviewingForm(null)}
          onSend={() => {
            setSendingForm(previewingForm);
            setPreviewingForm(null);
          }}
        />
      )}
      {sendingForm && (
        <SendFormModal
          form={sendingForm}
          customer={customer}
          onClose={() => {
            setSendingForm(null);
            setPickedFormId('');
            refresh();
          }}
        />
      )}
      {resendChoice && (
        <Modal title={`Resend "${resendChoice.formName}"`} onClose={() => setResendChoice(null)}>
          <p style={{ color: 'var(--muted)' }}>
            Resend the same link (it still shows their existing answers/status if already filled
            in), or send a brand-new one so they can fill the form in again.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6, marginBottom: 22 }}>
            <button
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
              onClick={() => {
                setResending(resendChoice);
                setResendChoice(null);
              }}
            >
              Resend the existing link
            </button>
            <button
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
              disabled={!forms.some((f) => f._id === resendChoice.form)}
              onClick={() => {
                setSendingForm(formFor(resendChoice));
                setResendChoice(null);
              }}
            >
              Send a new link
            </button>
            {!forms.some((f) => f._id === resendChoice.form) && (
              <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: -4 }}>
                The original "{resendChoice.formName}" form has since been deleted, so only the
                existing link can be resent.
              </div>
            )}
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setResendChoice(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
      {resending && (
        <SendFormModal
          form={formFor(resending)}
          customer={customer}
          existing={resending}
          onClose={() => {
            setResending(null);
            refresh();
          }}
        />
      )}
      {editing && (
        <EditFormSubmissionModal
          submission={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {deleting && (
        <Modal title="Delete this form submission?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently removes the <strong>{deleting.formName}</strong> link sent to{' '}
            {deleting.recipientName || deleting.recipientEmail}.
            {deleting.status === 'completed' &&
              " The customer/pet records it created are kept -- this only removes the submission record itself."}
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CustomerDefaultsTab({ customer, onChange }: { customer: Customer; onChange: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => {
    api.listProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  return (
    <div>
      <DefaultProductCard customer={customer} products={products} onChange={onChange} />
      <TravelCard customer={customer} products={products} onChange={onChange} />
      <RegularDaysCard customer={customer} onChange={onChange} />
      <CustomerPortalCard customer={customer} onChange={onChange} />
    </div>
  );
}

// iOS-style sliding toggle (visually-hidden checkbox under a custom track/thumb
// so it stays keyboard/screen-reader accessible). Mirrors the one in
// DocumentFormModal -- there's still no shared toggle-switch component.
function PortalToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <span style={{ position: 'relative', width: 36, height: 20, flexShrink: 0, opacity: disabled ? 0.5 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: 'absolute', inset: 0, opacity: 0, margin: 0, cursor: disabled ? 'default' : 'pointer' }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 999,
          background: checked ? 'var(--brand-green)' : 'var(--border)',
          transition: 'background 0.15s ease',
          pointerEvents: 'none',
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: 'white',
          transition: 'left 0.15s ease',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          pointerEvents: 'none',
        }}
      />
    </span>
  );
}

function CustomerPortalCard({ customer, onChange }: { customer: Customer; onChange: () => void }) {
  const [active, setActive] = useState(customer.portalActive ?? false);
  const [savingActive, setSavingActive] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [pushing, setPushing] = useState(false);

  async function handleToggle(value: boolean) {
    setSavingActive(true);
    setError(null);
    setNotice(null);
    setActive(value); // optimistic
    try {
      await api.setCustomerPortalActive(customer._id, value);
      setNotice(value ? 'Portal enabled for this customer.' : 'Portal disabled.');
      onChange();
    } catch (err) {
      setActive(!value); // revert
      setError(err instanceof Error ? err.message : 'Failed to update portal access');
    } finally {
      setSavingActive(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    setError(null);
    setNotice(null);
    try {
      await api.sendCustomerPortalReset(customer._id);
      setNotice('Password reset email sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the reset email');
    } finally {
      setResetting(false);
    }
  }

  async function handleTestPush() {
    setPushing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.sendCustomerPortalTestPush(customer._id, testMessage);
      if (!res.customerPushConfigured) {
        setError('Customer push isn\'t configured on the server (APNS_CUSTOMER_BUNDLE_ID).');
      } else if (res.total === 0) {
        setNotice('No devices registered for this customer yet — they need to sign in to the app first.');
      } else {
        setNotice(`Test push delivered to ${res.sent} of ${res.total} device(s).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the test push');
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="card">
      <h2>Mobile App Access</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
        Give this customer access to the Pawfect Pets customer app, where they can view their
        invoices, quotes and bookings. They log in with their email address ({customer.email}).
        Turning this off signs them out of the app immediately.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 400 }}>
          <PortalToggle checked={active} disabled={savingActive} onChange={handleToggle} />
          Portal Active
        </label>
      </div>
      <div className="modal-actions" style={{ justifyContent: 'flex-start', alignItems: 'center', gap: 12 }}>
        <button
          className="btn btn-secondary"
          onClick={handleReset}
          disabled={!active || resetting}
          title={active ? '' : 'Enable the portal first'}
        >
          {resetting ? 'Sending…' : 'Password reset'}
        </button>
        {notice && (
          <span style={{ color: 'var(--brand-green)', fontSize: '0.85rem', fontWeight: 600 }}>{notice}</span>
        )}
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
      <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem' }}>Send test push</h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0 }}>
        Send a one-off notification to this customer's app to check push is working.
      </p>
      <div className="field">
        <textarea
          rows={2}
          placeholder="Message (optional)"
          value={testMessage}
          onChange={(e) => setTestMessage(e.target.value)}
        />
      </div>
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn btn-secondary" onClick={handleTestPush} disabled={pushing}>
          {pushing ? 'Sending…' : 'Send test push'}
        </button>
      </div>
    </div>
  );
}

function DefaultProductCard({
  customer,
  products,
  onChange,
}: {
  customer: Customer;
  products: Product[] | null;
  onChange: () => void;
}) {
  const [productId, setProductId] = useState(customer.defaultProduct ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateCustomer(customer._id, { defaultProduct: productId || null });
      setSaved(true);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the default product');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h2>Default Product</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
        The product typically used for this customer.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label>Product</label>
        <select value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">No default</option>
          {products?.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="modal-actions" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {saved && (
          <span style={{ color: 'var(--brand-green)', fontSize: '0.85rem', fontWeight: 600 }}>Saved.</span>
        )}
      </div>
    </div>
  );
}

function TravelCard({
  customer,
  products,
  onChange,
}: {
  customer: Customer;
  products: Product[] | null;
  onChange: () => void;
}) {
  const [chargeable, setChargeable] = useState(customer.travelChargeable ?? false);
  const [productId, setProductId] = useState(customer.travelProduct ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (chargeable && !productId) {
      setError('Choose a product for the travel charge.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateCustomer(customer._id, {
        travelChargeable: chargeable,
        travelProduct: chargeable ? productId : null,
      });
      setSaved(true);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save travel charge settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h2>Travel</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
        When chargeable, one line item of the chosen product is added automatically every time a
        new invoice is created for this customer.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <div className="field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={chargeable}
            onChange={(e) => setChargeable(e.target.checked)}
            style={{ width: 'auto' }}
          />
          Is travel chargeable for this customer?
        </label>
      </div>
      {chargeable && (
        <div className="field">
          <label>Travel product</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select a product…</option>
            {products?.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="modal-actions" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {saved && (
          <span style={{ color: 'var(--brand-green)', fontSize: '0.85rem', fontWeight: 600 }}>Saved.</span>
        )}
      </div>
    </div>
  );
}

const WEEKDAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function RegularDaysCard({ customer, onChange }: { customer: Customer; onChange: () => void }) {
  const [days, setDays] = useState<string[]>(customer.regularDays ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleDay(day: string) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateCustomer(customer._id, { regularDays: days });
      setSaved(true);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save regular days');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h2>Regular Days</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
        The days this customer regularly books. Not used anywhere yet — reserved for a future
        feature.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {WEEKDAYS.map((day) => (
          <label key={day} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={days.includes(day)}
              onChange={() => toggleDay(day)}
              style={{ width: 'auto' }}
            />
            {WEEKDAY_LABELS[day]}
          </label>
        ))}
      </div>
      <div className="modal-actions" style={{ justifyContent: 'flex-start', alignItems: 'center', marginTop: 16 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {saved && (
          <span style={{ color: 'var(--brand-green)', fontSize: '0.85rem', fontWeight: 600 }}>Saved.</span>
        )}
      </div>
    </div>
  );
}

function EditFormSubmissionModal({
  submission,
  onClose,
  onSaved,
}: {
  submission: FormSubmissionRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(submission.recipientName ?? '');
  const [email, setEmail] = useState(submission.recipientEmail);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.updateFormSubmission(submission._id, { recipientName: name || undefined, recipientEmail: email });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Edit "${submission.formName}" link`} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Recipient name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Recipient email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
