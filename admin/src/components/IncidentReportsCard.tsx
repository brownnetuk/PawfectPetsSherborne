import { useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import { buildFormSubmissionPdf } from '../pdf/formSubmissionPdf';
import type { FormField, FormSubmissionRecord, IncidentReportRecord } from '../types';
import FormFillModal from './FormFillModal';
import Modal from './Modal';
import ViewFormSubmissionModal from './ViewFormSubmissionModal';
import { MailIcon, PencilIcon, TrashIcon } from './icons';

// What a list row shows, read off the report's own fields by type rather
// than by fixed id, so it still works once staff have edited the form in
// Settings > Forms: the first date/time field is when it happened, the
// first plain multi-select is the incident type, the customer's-dogs field
// is which dogs, and the first required free-text box is the description.
function summarise(report: FormSubmissionRecord) {
  const fields: FormField[] = report.formFieldsSnapshot ?? [];
  const answers = report.answers ?? {};
  const answer = (field: FormField | undefined) => (field ? answers[field.id] : undefined);
  const asText = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);
  const asList = (value: unknown) =>
    Array.isArray(value) ? (value as string[]) : typeof value === 'string' && value ? [value] : [];

  const date = asText(answer(fields.find((f) => f.type === 'date')));
  const time = asText(answer(fields.find((f) => f.type === 'time')));
  const parsed = date ? new Date(`${date}T${time ?? '00:00'}`) : null;
  const when =
    parsed && !Number.isNaN(parsed.getTime())
      ? parsed.toLocaleString('en-GB', time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
      : report.submittedAt
        ? new Date(report.submittedAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })
        : '';
  const types = asList(
    answer(fields.find((f) => f.type === 'multichoice' && f.optionsSource !== 'customerPets')),
  );
  const dogs = asList(
    answer(fields.find((f) => (f.type === 'multichoice' || f.type === 'choice') && f.optionsSource === 'customerPets')),
  );
  const reportedBy = asText(answer(fields.find((f) => f.type === 'text' && /reported by/i.test(f.label))));
  const description = asText(answer(fields.find((f) => f.type === 'textarea' && f.required)));
  return { when, types, dogs, reportedBy, description };
}

// One entry in the fill form's "Booking reference" picker.
interface BookingOption {
  id: string;
  reference: string;
  label: string;
  petNames: string[];
  archived: boolean;
}

async function loadBookingOptions(): Promise<BookingOption[]> {
  const rows = await api.listBoardingBookings();
  const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return [...rows]
    .sort((a, b) => b.booking.startDate.localeCompare(a.booking.startDate))
    .map(({ booking }) => {
      const customer = typeof booking.customer === 'string' ? undefined : booking.customer.name;
      const petNames = booking.animals.map((a) => (typeof a === 'string' ? null : a.name)).filter((n): n is string => !!n);
      const dates =
        booking.startDate === booking.endDate
          ? shortDate(booking.startDate)
          : `${shortDate(booking.startDate)} – ${shortDate(booking.endDate)}`;
      return {
        id: booking._id,
        reference: booking.reference,
        label: [booking.reference, customer, petNames.join(', '), dates].filter(Boolean).join(' · '),
        petNames,
        archived: !!booking.archived,
      };
    });
}

// The incident report fill form, with a "Booking reference" picker above it
// that says which booking (and so which customer) the report is for. On a
// new report, picking a different booking restarts the form against that
// booking, so "Dog(s) involved" lists that customer's dogs; on an existing
// one, it re-links the report there straight away.
function IncidentReportFillModal({
  initialBookingId,
  editSubmissionId,
  onClose,
  onChanged,
}: {
  // Unset when started from the all-bookings list -- staff pick one first.
  initialBookingId?: string;
  // Set to edit a submitted report instead of starting a new one.
  editSubmissionId?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const editing = !!editSubmissionId;
  const [options, setOptions] = useState<BookingOption[] | null>(null);
  const [bookingId, setBookingId] = useState(initialBookingId ?? '');
  const [submissionId, setSubmissionId] = useState<string | null>(editSubmissionId ?? null);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the new report has been submitted -- one closed without
  // submitting is discarded rather than left pending.
  const submitted = useRef(false);

  useEffect(() => {
    loadBookingOptions()
      .then(setOptions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bookings'));
  }, []);

  // A new report's pending submission is created once a booking is chosen.
  useEffect(() => {
    if (editing || !bookingId || submissionId) return;
    let cancelled = false;
    api
      .createBookingIncidentReport(bookingId)
      .then((s) => {
        if (cancelled) api.deleteBookingIncidentReport(bookingId, s._id).catch(() => {});
        else setSubmissionId(s._id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to start an incident report'));
    return () => {
      cancelled = true;
    };
  }, [editing, bookingId, submissionId]);

  function discardPending() {
    if (!editing && !submitted.current && submissionId && bookingId) {
      api.deleteBookingIncidentReport(bookingId, submissionId).catch(() => {});
    }
  }

  async function handlePickBooking(next: string) {
    if (!next || next === bookingId) return;
    setError(null);
    if (!editing) {
      discardPending();
      setSubmissionId(null);
      setBookingId(next);
      return;
    }
    setSwitching(true);
    try {
      await api.moveBookingIncidentReport(bookingId, submissionId!, next);
      setBookingId(next);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link the report to that booking');
    } finally {
      setSwitching(false);
    }
  }

  function handleClose() {
    discardPending();
    onClose();
  }

  const selected = options?.find((o) => o.id === bookingId);
  const title = editing ? 'Edit incident report' : 'Incident report';
  const picker = (
    <>
      <div className="field">
        <label>
          Booking reference <span style={{ color: 'var(--error)' }}>*</span>
        </label>
        <select value={bookingId} onChange={(e) => handlePickBooking(e.target.value)} disabled={!options || switching}>
          <option value="" disabled>
            {options ? 'Choose a booking…' : 'Loading bookings…'}
          </option>
          {(options ?? [])
            .filter((o) => !o.archived || o.id === bookingId)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
        </select>
        <div className="hint">
          {editing
            ? 'Changing this links the report to that booking and its customer straight away -- save any other changes first.'
            : "Links the report to the booking and its customer -- \"Dog(s) involved\" lists that customer's dogs."}
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
    </>
  );

  if (!bookingId || !submissionId) {
    return (
      <Modal title={title} onClose={handleClose} wide>
        {picker}
        {bookingId && !error && <p>Loading…</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <FormFillModal
      // Remounted per booking, so the form reloads with that customer's dogs.
      key={`${submissionId}:${bookingId}`}
      submissionId={submissionId}
      title={title}
      header={picker}
      presetPetNames={selected?.petNames}
      pdfReference={selected?.reference}
      saveEdit={
        editing
          ? async (answers) => {
              await api.updateBookingIncidentReport(bookingId, submissionId, answers);
            }
          : undefined
      }
      onClose={handleClose}
      onSubmitted={() => {
        submitted.current = true;
        onChanged();
      }}
    />
  );
}

// Incident Report forms filled in against Boarding & Day Care bookings --
// on a booking's detail page (after Observations) when given `bookingId`,
// otherwise every booking's reports (Boarding & Day Care > Incident
// Reports). Each is a form submission of Settings > Boarding's "Incident
// report form" (see backend BookingIncidentReportsService). Not affected by
// the booking's read-only state: a report can need adding or reviewing
// after the stay is finished.
export default function IncidentReportsCard({
  bookingId,
  onOpenBooking,
}: {
  bookingId?: string;
  // All-bookings list only: jump to a report's booking.
  onOpenBooking?: (bookingId: string) => void;
}) {
  const [reports, setReports] = useState<IncidentReportRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 'new' = adding, otherwise the report being edited.
  const [filling, setFilling] = useState<IncidentReportRecord | 'new' | null>(null);
  const [viewing, setViewing] = useState<IncidentReportRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<IncidentReportRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [emailing, setEmailing] = useState<string | null>(null);
  const [emailed, setEmailed] = useState<Set<string>>(new Set());

  function refresh() {
    (bookingId ? api.listBookingIncidentReports(bookingId) : api.listIncidentReports())
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load incident reports'));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [bookingId]);

  async function handleEmail(report: IncidentReportRecord) {
    setEmailing(report._id);
    setError(null);
    try {
      const full = await api.getFormSubmission(report._id);
      const reference = report.booking?.reference;
      const doc = await buildFormSubmissionPdf(full, { reference });
      await api.sendFormSubmissionCopy(
        report._id,
        doc.output('datauristring'),
        `${[full.formName, reference].filter(Boolean).join(' - ')}.pdf`,
      );
      setEmailed((prev) => new Set(prev).add(report._id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to email the incident report');
    } finally {
      setEmailing(null);
    }
  }

  async function handleDelete() {
    if (!confirmDelete?.booking) return;
    setDeleting(true);
    try {
      await api.deleteBookingIncidentReport(confirmDelete.booking._id, confirmDelete._id);
      setConfirmDelete(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete that incident report');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>
          Incident reports{reports && reports.length > 0 ? ` (${reports.length})` : ''}
        </div>
        <button className="btn btn-secondary" onClick={() => setFilling('new')}>
          Add incident report
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!reports ? (
        <div className="empty-state">Loading…</div>
      ) : reports.length === 0 ? (
        <div className="empty-state">No incidents reported.</div>
      ) : (
        reports.map((report) => {
          const { when, types, dogs, reportedBy, description } = summarise(report);
          return (
            <div key={report._id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', cursor: 'pointer' }}
                  title="View report"
                  onClick={() => setViewing(report)}
                >
                  {(types.length > 0 ? types : ['Incident']).map((t) => (
                    <span
                      key={t}
                      style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: 999,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: '#fee2e2',
                        color: '#991b1b',
                      }}
                    >
                      {t}
                    </span>
                  ))}
                  {when && <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{when}</span>}
                  {dogs.length > 0 && <span style={{ fontSize: '0.85rem' }}>{dogs.join(', ')}</span>}
                  {reportedBy && <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>by {reportedBy}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {emailed.has(report._id) ? (
                    <span style={{ fontSize: '0.78rem', color: 'var(--brand-green)', fontWeight: 600 }}>Emailed</span>
                  ) : (
                    <button
                      className="btn-link"
                      title="Email a copy to the customer"
                      disabled={emailing === report._id}
                      onClick={() => handleEmail(report)}
                    >
                      <MailIcon />
                    </button>
                  )}
                  <button className="btn-link" title="Edit" onClick={() => setFilling(report)}>
                    <PencilIcon />
                  </button>
                  <button className="btn-link" title="Delete" onClick={() => setConfirmDelete(report)}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
              {!bookingId && report.booking && (
                <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                  <button
                    className="btn-link"
                    title="Open booking"
                    onClick={() => onOpenBooking?.(report.booking!._id)}
                    disabled={!onOpenBooking}
                  >
                    {report.booking.reference}
                  </button>
                  {report.booking.customerName && (
                    <span style={{ color: 'var(--muted)' }}> · {report.booking.customerName}</span>
                  )}
                </div>
              )}
              {description && (
                <div
                  style={{ fontSize: '0.88rem', marginTop: 6, whiteSpace: 'pre-wrap', cursor: 'pointer' }}
                  onClick={() => setViewing(report)}
                >
                  {description}
                </div>
              )}
            </div>
          );
        })
      )}

      {filling && (
        <IncidentReportFillModal
          initialBookingId={filling === 'new' ? bookingId : filling.booking?._id}
          editSubmissionId={filling === 'new' ? undefined : filling._id}
          onClose={() => {
            setFilling(null);
            refresh();
          }}
          onChanged={refresh}
        />
      )}
      {viewing && (
        <ViewFormSubmissionModal
          submission={viewing}
          reference={viewing.booking?.reference}
          onClose={() => setViewing(null)}
        />
      )}
      {confirmDelete && (
        <Modal title="Delete this incident report?" onClose={() => setConfirmDelete(null)}>
          <p>This removes the report from its booking and the customer's forms.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
