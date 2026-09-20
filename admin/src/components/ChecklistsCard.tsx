import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { ChecklistTemplate } from '../types';
import Modal from './Modal';
import { PencilIcon, TrashIcon } from './icons';

// Settings > Boarding > Checklists -- reusable named task lists staff assign
// to specific days on the Boarding & DayCare > Checklists calendar. Not
// built on NamedListCard since a checklist needs an ordered list of items,
// not just a single name field.
export default function ChecklistsCard() {
  const [templates, setTemplates] = useState<ChecklistTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ChecklistTemplate | null | 'new'>(null);
  const [deleting, setDeleting] = useState<ChecklistTemplate | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    api
      .listChecklistTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load checklists'));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteChecklistTemplate(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this checklist');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>Checklists</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            Reusable task lists (e.g. "Morning Boarding Round") staff can assign to specific days on the
            Boarding &amp; DayCare page.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          Create new
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!templates || templates.length === 0 ? (
        <div className="empty-state">{templates === null ? 'Loading…' : 'No checklists yet.'}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Items</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t._id}>
                <td>{t.name}</td>
                <td>{t.items.length}</td>
                <td>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button className="icon-btn" title="Edit" onClick={() => setEditing(t)}>
                      <PencilIcon />
                    </button>
                    <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(t)}>
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <EditChecklistModal
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title="Delete checklist?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently removes <strong>{deleting.name}</strong>. Days it's already been assigned to keep
            their own copy of its items, unaffected.
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
    </div>
  );
}

function EditChecklistModal({
  template,
  onClose,
  onSaved,
}: {
  template: ChecklistTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [items, setItems] = useState<string[]>(template?.items ?? ['']);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateItem(i: number, value: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? value : it)));
  }
  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanedItems = items.map((it) => it.trim()).filter(Boolean);
    if (cleanedItems.length === 0) {
      setError('Add at least one item.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input = { name, items: cleanedItems };
      if (template) {
        await api.updateChecklistTemplate(template._id, input);
      } else {
        await api.createChecklistTemplate(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save this checklist');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={template ? 'Edit checklist' : 'New checklist'} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning Boarding Round"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label>Items</label>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input type="text" value={item} onChange={(e) => updateItem(i, e.target.value)} placeholder={`Item ${i + 1}`} />
              <button
                type="button"
                className="icon-btn icon-btn-danger"
                title="Remove item"
                onClick={() => removeItem(i)}
                disabled={items.length === 1}
              >
                <TrashIcon />
              </button>
            </div>
          ))}
          <button type="button" className="btn-link" onClick={() => setItems((prev) => [...prev, ''])}>
            + Add item
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
