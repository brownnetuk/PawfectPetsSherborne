import Modal from './Modal';

export default function ProductAvailabilityWarningModal({
  message,
  onCancel,
  onConfirm,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Check product type" onClose={onCancel}>
      <p>{message}</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          Use anyway
        </button>
      </div>
    </Modal>
  );
}
