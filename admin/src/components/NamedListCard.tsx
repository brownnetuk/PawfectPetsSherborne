import { useEffect, useState } from 'react';
import Modal from './Modal';
import { PencilIcon, TrashIcon } from './icons';

interface NamedItem {
  _id: string;
  name: string;
}

interface Props<T extends NamedItem> {
  title: string;
  description: string;
  /** Singular, lowercase -- e.g. "payment method", "bank account". */
  itemNoun: string;
  /** Only needed when plain `itemNoun + 's'` isn't right -- e.g. "expense categories". */
  itemNounPlural?: string;
  createLabel?: string;
  namePlaceholder?: string;
  list: () => Promise<T[]>;
  create: (input: { name: string }) => Promise<T>;
  update: (id: string, input: { name: string }) => Promise<T>;
  remove: (id: string) => Promise<void>;
}

/** A reusable "list of named things" settings card -- table + Create/Edit/Delete,
 * each backed by a simple { name } CRUD endpoint. Used for Payment Methods, Bank
 * Accounts, and Payments, which all currently need nothing more than a name. */
export default function NamedListCard<T extends NamedItem>({
  title,
  description,
  itemNoun,
  itemNounPlural = `${itemNoun}s`,
  createLabel = 'Create new',
  namePlaceholder,
  list,
  create,
  update,
  remove,
}: Props<T>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    list()
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : `Failed to load ${itemNounPlural}`));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [list]);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await remove(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : `Failed to delete this ${itemNoun}`);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>{title}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>{description}</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          {createLabel}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!items || items.length === 0 ? (
        <div className="empty-state">{items === null ? 'Loading…' : `No ${itemNounPlural} yet.`}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id}>
                <td>{item.name}</td>
                <td>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button className="icon-btn" title="Edit" onClick={() => setEditing(item)}>
                      <PencilIcon />
                    </button>
                    <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(item)}>
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(showNew || editing) && (
        <EditNamedItemModal
          item={editing}
          itemNoun={itemNoun}
          namePlaceholder={namePlaceholder}
          onClose={() => {
            setShowNew(false);
            setEditing(null);
          }}
          onSave={(name) => (editing ? update(editing._id, { name }) : create({ name }))}
          onSaved={() => {
            setShowNew(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title={`Delete ${itemNoun}?`} onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently removes <strong>{deleting.name}</strong>.
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function EditNamedItemModal({
  item,
  itemNoun,
  namePlaceholder,
  onClose,
  onSave,
  onSaved,
}: {
  item: NamedItem | null;
  itemNoun: string;
  namePlaceholder?: string;
  onClose: () => void;
  onSave: (name: string) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSave(name);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to save this ${itemNoun}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={capitalize(item ? `Edit ${itemNoun}` : `Create ${itemNoun}`)} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={namePlaceholder}
            required
            autoFocus
          />
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
