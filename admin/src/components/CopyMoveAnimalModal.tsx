import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { Animal, Customer } from '../types';
import CustomerPicker from './CustomerPicker';
import Modal from './Modal';

// Shared by the Pets tab's "Copy to another customer…" and "Move to another
// customer…" actions -- same customer picker, just different wording and API
// call depending on `mode`. See backend/src/animals/schemas/animal.schema.ts's
// Animal.linkedAnimal doc comment for what "copy" actually does (a real,
// separate record kept in sync, not a one-off snapshot).
export default function CopyMoveAnimalModal({
  animal,
  currentCustomerId,
  mode,
  onClose,
  onDone,
}: {
  animal: Animal;
  currentCustomerId: string;
  mode: 'copy' | 'move';
  onClose: () => void;
  onDone: () => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [targetId, setTargetId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listCustomers().then(setCustomers).catch(() => {});
  }, []);

  const otherCustomers = customers.filter((c) => c._id !== currentCustomerId);

  async function handleConfirm() {
    if (!targetId) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === 'copy') {
        await api.copyAnimal(animal._id, targetId);
      } else {
        await api.moveAnimal(animal._id, targetId);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${mode} this pet`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={mode === 'copy' ? `Copy ${animal.name} to…` : `Move ${animal.name} to…`} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
        {mode === 'copy'
          ? 'Creates a linked copy of this pet under another customer -- editing either one updates both, so they stay in sync.'
          : 'Reassigns this pet to another customer outright -- same record, just a different owner.'}
      </p>
      <div className="field">
        <label>Customer</label>
        <CustomerPicker customers={otherCustomers} value={targetId} onChange={setTargetId} />
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleConfirm} disabled={saving || !targetId}>
          {saving ? 'Saving…' : mode === 'copy' ? 'Copy pet' : 'Move pet'}
        </button>
      </div>
    </Modal>
  );
}
