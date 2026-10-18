import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { RegistrationSnapshot } from '../api/client';
import { buildCustomerFormPdf } from '../pdf/customerFormPdf';
import Modal from './Modal';

// Rebuilds every registration form PDF already stored on a customer's
// Activity tab (sent-email and intake-completion snapshots) in the current
// PDF style. The PDF is built client-side exactly as "View" on the customer
// page builds it -- from the customer's record as it stands today, since the
// snapshots only ever stored the PDF, not the data behind it. The backend
// keeps each entry's original PDF (AuditLogEntry.originalAttachmentData), so
// a run can always be undone.
export default function RegistrationPdfsCard() {
  const [snapshots, setSnapshots] = useState<RegistrationSnapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [finished, setFinished] = useState(false);

  function refresh() {
    api
      .listRegistrationSnapshots()
      .then(setSnapshots)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load registration PDFs'));
  }
  useEffect(refresh, []);

  const customerCount = new Set((snapshots ?? []).map((s) => s.customer)).size;
  const regeneratedCount = (snapshots ?? []).filter((s) => s.regeneratedAt).length;

  async function regenerateAll() {
    if (!snapshots) return;
    setConfirming(false);
    setRunning(true);
    setFinished(false);
    setFailures([]);
    setSkipped(0);
    setProgress({ done: 0, total: snapshots.length });

    const businessInfo = await api.getBusinessInfo().catch(() => null);
    // Snapshots outlive their customer -- deleting a customer leaves its
    // Activity entries behind -- so those are skipped (and left untouched)
    // rather than reported as failures.
    const customerIds = await api
      .listCustomers()
      .then((list) => new Set(list.map((c) => c._id)))
      .catch(() => null);
    const byCustomer = new Map<string, RegistrationSnapshot[]>();
    for (const s of snapshots) {
      byCustomer.set(s.customer, [...(byCustomer.get(s.customer) ?? []), s]);
    }

    let done = 0;
    let orphaned = 0;
    const failed: string[] = [];
    // One customer at a time -- each PDF is built in the browser and is a
    // few hundred KB, so running them all at once would just stall the tab.
    for (const [customerId, entries] of byCustomer) {
      let customerName = customerId;
      if (customerIds && !customerIds.has(customerId)) {
        orphaned += entries.length;
        done += entries.length;
        setProgress({ done, total: snapshots.length });
        continue;
      }
      try {
        const customer = await api.getCustomer(customerId);
        customerName = customer.name;
        const animals = await api.listAnimals(customerId);
        const alarm = await api.getAlarmInstructions(customerId).catch(() => null);
        const doc = await buildCustomerFormPdf(
          customer,
          animals,
          alarm,
          businessInfo?.termsHtml ?? '',
          businessInfo?.emergencyVetAuthorisationText ?? '',
          businessInfo?.offLeadConsentText ?? '',
          businessInfo?.declarationText ?? '',
        );
        const data = doc.output('datauristring');
        const fallbackName = `${customer.name.replace(/[^a-z0-9]+/gi, '-')}-registration-form.pdf`;
        for (const entry of entries) {
          await api.replaceSnapshotAttachment(entry._id, data, entry.attachmentName || fallbackName);
          done += 1;
          setProgress({ done, total: snapshots.length });
        }
      } catch (err) {
        failed.push(`${customerName}: ${err instanceof Error ? err.message : 'failed'}`);
        done += entries.length;
        setProgress({ done, total: snapshots.length });
      }
    }

    setFailures(failed);
    setSkipped(orphaned);
    setRunning(false);
    setFinished(true);
    refresh();
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>Registration form PDFs</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            Rebuild every registration form PDF stored on customers' Activity tabs in the current style,
            using each customer's details as they stand today. The original PDFs are kept so this can be undone.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          disabled={running || !snapshots || snapshots.length === 0}
          onClick={() => setConfirming(true)}
        >
          {running ? 'Regenerating…' : 'Regenerate all'}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {snapshots === null ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <p style={{ fontSize: '0.9rem' }}>
          {snapshots.length} stored PDF{snapshots.length === 1 ? '' : 's'} across {customerCount} customer
          {customerCount === 1 ? '' : 's'}
          {regeneratedCount > 0 && `, ${regeneratedCount} already regenerated`}.
        </p>
      )}
      {progress && (running || finished) && (
        <p style={{ fontSize: '0.9rem' }}>
          {running ? 'Working…' : 'Finished.'} {progress.done} of {progress.total} done
          {skipped > 0 && `, ${skipped} skipped because the customer has been deleted`}
          {failures.length > 0 && `, ${failures.length} customer${failures.length === 1 ? '' : 's'} failed`}.
        </p>
      )}
      {failures.length > 0 && (
        <div className="error-banner">
          {failures.map((f) => (
            <div key={f}>{f}</div>
          ))}
        </div>
      )}

      {confirming && snapshots && (
        <Modal title="Regenerate registration PDFs?" onClose={() => setConfirming(false)}>
          <p>
            This rebuilds all {snapshots.length} stored registration form PDFs in the new style from each
            customer's current details, so older snapshots will show today's information rather than what was
            on file when they were sent. The original PDFs are kept on the server.
          </p>
          <p>Keep this tab open until it finishes.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={regenerateAll}>
              Regenerate
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
