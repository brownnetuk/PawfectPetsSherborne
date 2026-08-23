import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { FormRecord } from '../types';
import Modal from './Modal';
import SendFormModal from './SendFormModal';
import { MailIcon, PencilIcon, TrashIcon } from './icons';

interface Props {
  onEdit: (form: FormRecord | null) => void;
}

export default function FormsListCard({ onEdit }: Props) {
  const [forms, setForms] = useState<FormRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<FormRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sending, setSending] = useState<FormRecord | null>(null);

  function refresh() {
    api.listForms().then(setForms).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load forms'));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteForm(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this form');
    } finally {
      setDeleteBusy(false);
    }
  }

  function countFields(form: FormRecord): number {
    return form.fields.reduce((sum, f) => sum + 1 + (f.type === 'group' ? f.fields.length : 0), 0);
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>Forms</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            Build custom forms, email them to customers, and (for mapped fields) create real
            customer/pet records straight from the answers.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => onEdit(null)}>
          Create new
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!forms || forms.length === 0 ? (
        <div className="empty-state">{forms === null ? 'Loading…' : 'No forms yet.'}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Description</th>
              <th>Fields</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {forms.map((form) => (
              <tr key={form._id}>
                <td>{form.name}</td>
                <td>{form.description || '—'}</td>
                <td>{countFields(form)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button className="icon-btn" title="Send" onClick={() => setSending(form)}>
                      <MailIcon />
                    </button>
                    <button className="icon-btn" title="Edit" onClick={() => onEdit(form)}>
                      <PencilIcon />
                    </button>
                    <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(form)}>
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {deleting && (
        <Modal title="Delete form?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently removes <strong>{deleting.name}</strong>. Submissions already
            collected against it are kept (they snapshot their own copy of the form's fields), but
            it can no longer be sent to anyone new.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {sending && <SendFormModal form={sending} onClose={() => setSending(null)} />}
    </div>
  );
}
