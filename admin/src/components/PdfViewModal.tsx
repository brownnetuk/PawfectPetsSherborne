import Modal from './Modal';

interface Props {
  title: string;
  pdfUrl: string | null;
  pdfLoading: boolean;
  pdfError: string | null;
  downloadName: string;
  onClose: () => void;
}

export default function PdfViewModal({ title, pdfUrl, pdfLoading, pdfError, downloadName, onClose }: Props) {
  return (
    <Modal title={title} onClose={onClose} xl>
      {pdfError && <div className="error-banner">{pdfError}</div>}
      {pdfLoading && !pdfUrl && !pdfError && <div className="empty-state">Preparing the PDF…</div>}
      {pdfUrl && (
        <iframe
          src={pdfUrl}
          title={title}
          style={{ width: '100%', height: '75vh', border: '1px solid var(--border)', borderRadius: 8 }}
        />
      )}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
        {pdfUrl && (
          <a href={pdfUrl} download={downloadName} className="btn btn-primary">
            Download
          </a>
        )}
      </div>
    </Modal>
  );
}
