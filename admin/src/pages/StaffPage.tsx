import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Modal from '../components/Modal';
import { TrashIcon } from '../components/icons';
import type { Staff } from '../types';

export default function StaffPage() {
  const { staff: currentStaff } = useAuth();
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deletingStaff, setDeletingStaff] = useState<Staff | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function refresh() {
    api.listStaff().then(setStaff).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deletingStaff) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteStaff(deletingStaff.id);
      setDeletingStaff(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete staff account');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Staff</h1>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          New staff account
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {!staff || staff.length === 0 ? (
          <div className="empty-state">{staff === null ? 'Loading…' : 'No staff accounts yet.'}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const isSelf = s.id === currentStaff?.id;
                return (
                  <tr key={s.id}>
                    <td>
                      {s.name}
                      {isSelf && <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}> (you)</span>}
                    </td>
                    <td>{s.email}</td>
                    <td>
                      <button
                        className="icon-btn icon-btn-danger"
                        title={isSelf ? "You can't delete your own account while signed in" : 'Delete'}
                        disabled={isSelf}
                        style={isSelf ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
                        onClick={() => setDeletingStaff(s)}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewStaffModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}

      {deletingStaff && (
        <Modal title="Delete staff account?" onClose={() => setDeletingStaff(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This removes <strong>{deletingStaff.name}</strong>'s ability to log in. Any active session of
            theirs stays valid until their token expires.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeletingStaff(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete account'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NewStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.registerStaff(name, email, password);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create staff account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New staff account" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
          <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
            At least 8 characters.
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
