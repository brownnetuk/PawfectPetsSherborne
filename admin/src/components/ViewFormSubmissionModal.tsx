import { useEffect, useState } from 'react';
import { buildFormSubmissionPdf } from '../pdf/formSubmissionPdf';
import type { FormSubmissionRecord } from '../types';
import Modal from './Modal';

export default function ViewFormSubmissionModal({
  submission,
  onClose,
}: {
  submission: FormSubmissionRecord;
  onClose: () => void;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (submission.status !== 'completed') return;
    let cancelled = false;
    let objectUrl: string | null = null;
    buildFormSubmissionPdf(submission)
      .then((doc) => {
        if (cancelled) return;
        // A blob URL, not doc.output('datauristring') -- jsPDF's datauristring
        // embeds a non-standard ";filename=...;" segment that breaks Chrome's
        // PDF viewer when used as an iframe src (see CustomerDetailPage.tsx's
        // toPdfIframeSrc for the same bug hit -- and fixed -- there).
        objectUrl = URL.createObjectURL(doc.output('blob'));
        setPdfUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to generate the PDF');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [submission]);

  return (
    <Modal title={submission.formName} onClose={onClose} xl>
      {submission.status !== 'completed' ? (
        <div className="empty-state">Not filled in yet.</div>
      ) : error ? (
        <div className="error-banner">{error}</div>
      ) : pdfUrl ? (
        <iframe
          src={pdfUrl}
          title={`${submission.formName} PDF`}
          style={{ width: '100%', height: '75vh', border: '1px solid var(--border)', borderRadius: 8 }}
        />
      ) : (
        <div className="empty-state">Preparing…</div>
      )}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
