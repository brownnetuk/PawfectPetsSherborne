import { useState } from 'react';
import Modal from './Modal';

const INTAKE_URL = import.meta.env.VITE_INTAKE_URL ?? 'http://localhost:5173';

interface Props {
  customerId: string;
  onClose: () => void;
  onChooseManual: () => void;
}

export default function AddPetChoiceModal({ customerId, onClose, onChooseManual }: Props) {
  const [showLink, setShowLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = `${INTAKE_URL}/intake/${customerId}/add-pet`;

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  if (showLink) {
    return (
      <Modal title="Send registration link" onClose={onClose}>
        <p style={{ color: 'var(--muted)' }}>
          Send the customer this link — it opens straight to "How many pets?" so they can add
          their pet's details themselves without touching the rest of their record.
        </p>
        <div className="link-copy-box">{link}</div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add a pet" onClose={onClose}>
      <p style={{ color: 'var(--muted)' }}>
        Add the pet's details yourself, or send the customer a link to add it themselves.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6, marginBottom: 22 }}>
        <button className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={onChooseManual}>
          Add manually
        </button>
        <button
          className="btn btn-secondary"
          style={{ justifyContent: 'flex-start' }}
          onClick={() => setShowLink(true)}
        >
          Send a link to the customer
        </button>
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}
