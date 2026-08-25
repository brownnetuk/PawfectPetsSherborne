import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { Customer } from '../types';

interface Props {
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}

// Quickly creates a minimal customer record (name + email only, same
// createLead() used by the registration-link flow) so staff can raise an
// invoice/quote for a one-off customer without leaving this form to go
// create a full customer record first.
export default function ManualCustomerModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const customer = await api.createLead(name, email);
      onCreated(customer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Manual Customer" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
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
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Customer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
