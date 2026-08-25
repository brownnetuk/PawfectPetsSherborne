import { useState } from 'react';
import Modal from './Modal';

export interface ManualCustomer {
  name: string;
  email: string;
}

interface Props {
  onClose: () => void;
  onSet: (customer: ManualCustomer) => void;
}

// Purely a local placeholder -- name/email typed here are stored directly on
// the quote (Quote.manualCustomerName/Email), not turned into a real
// Customer record. QuotesService only creates (or reuses, by matching email)
// a real Customer the moment the quote is marked accepted.
export default function ManualCustomerModal({ onClose, onSet }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSet({ name: name.trim(), email: email.trim() });
  }

  return (
    <Modal title="Manual Customer" onClose={onClose}>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -6 }}>
        A placeholder for this quote only -- no customer record is created unless the quote is accepted.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Customer Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-success">
            Use This Customer
          </button>
        </div>
      </form>
    </Modal>
  );
}
