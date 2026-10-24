import { useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import { buildFormSubmissionPdf } from '../pdf/formSubmissionPdf';
import type { FormField, FormSubmissionRecord } from '../types';
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

// Incident Report forms filled in against a Boarding & Day Care booking --
// shown on its Booking Detail page, after Observations, as many as needed.
// Each is a form submission of Settings > Boarding's "Incident report form"
// (see backend BookingIncidentReportsService). Not affected by the
// booking's read-only state: a report can need adding or reviewing after
// the stay is finished.
export default function IncidentReportsCard({
  bookingId,
  reference,
  petNames,
}: {
  bookingId: string;
  reference: string;
  // The booking's dogs -- pre-ticked on a new report's "Dog(s) involved".
  petNames: string[];
}) {
  const [reports, setReports] = useState<FormSubmissionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [filling, setFilling] = useState<{ submissionId: string; editing: boolean } | null>(null);
  const [viewing, setViewing] = useState<FormSubmissionRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FormSubmissionRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [emailing, setEmailing] = useState<string | null>(null);
  const [emailed, setEmailed] = useState<Set<string>>(new Set());
  // Whether the report open in FormFillModal has been submitted -- a new
  // one closed without submitting is discarded rather than left pending.
  const submitted = useRef(false);

  function refresh() {
    api
      .listBookingIncidentReports(bookingId)
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load incident reports'));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [bookingId]);

  async function handleAdd() {
    setStarting(true);
    setError(null);
    try {
      const submission = await api.createBookingIncidentReport(bookingId);
      submitted.current = false;
      setFilling({ submissionId: submission._id, editing: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start an incident report');
    } finally {
      setStarting(false);
    }
  }

  function handleFillClosed() {
    if (filling && !filling.editing && !submitted.current) {
      api.deleteBookingIncidentReport(bookingId, filling.submissionId).catch(() => {});
    }
    setFilling(null);
  }

  async function handleEmail(report: FormSubmissionRecord) {
    setEmailing(report._id);
    setError(null);
    try {
      const full = await api.getFormSubmission(report._id);
      const doc = await buildFormSubmissionPdf(full, { reference });
      await api.sendFormSubmissionCopy(report._id, doc.output('datauristring'), `${full.formName} - ${reference}.pdf`);
      setEmailed((prev) => new Set(prev).add(report._id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to email the incident report');
    } finally {
      setEmailing(null);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteBookingIncidentReport(bookingId, confirmDelete._id);
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
        <button className="btn btn-secondary" onClick={handleAdd} disabled={starting}>
          {starting ? 'Starting…' : 'Add incident report'}
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
                  <button
                    className="btn-link"
                    title="Edit"
                    onClick={() => {
                      submitted.current = false;
                      setFilling({ submissionId: report._id, editing: true });
                    }}
                  >
                    <PencilIcon />
                  </button>
                  <button className="btn-link" title="Delete" onClick={() => setConfirmDelete(report)}>
                    <TrashIcon />
                  </button>
                </div>
              </div>
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
        <FormFillModal
          submissionId={filling.submissionId}
          title={filling.editing ? 'Edit incident report' : 'Incident report'}
          presetPetNames={petNames}
          pdfReference={reference}
          saveEdit={
            filling.editing
              ? async (answers) => {
                  await api.updateBookingIncidentReport(bookingId, filling.submissionId, answers);
                }
              : undefined
          }
          onClose={handleFillClosed}
          onSubmitted={() => {
            submitted.current = true;
            refresh();
          }}
        />
      )}
      {viewing && <ViewFormSubmissionModal submission={viewing} reference={reference} onClose={() => setViewing(null)} />}
      {confirmDelete && (
        <Modal title="Delete this incident report?" onClose={() => setConfirmDelete(null)}>
          <p>This permanently removes the report from this booking and the customer's forms.</p>
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
