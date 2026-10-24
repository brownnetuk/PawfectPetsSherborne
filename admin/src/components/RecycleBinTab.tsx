import { useEffect, useMemo, useState } from 'react';
import * as api from '../api/client';
import type { RecycleBinEntry } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Modal from './Modal';

// Settings > Recycle Bin. Everything deleted anywhere in the app (admin,
// staff app or customer app) lands here first -- see
// backend/src/recycle-bin/. Anyone can restore; permanently deleting needs
// the recycleBin.purge permission, which the Admin role has.
export default function RecycleBinTab() {
  const { staff } = useAuth();
  const canPurge = staff?.isBreakGlass || !staff?.role || staff.role.permissions.includes('recycleBin.purge');
  const [entries, setEntries] = useState<RecycleBinEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purging, setPurging] = useState<RecycleBinEntry | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  function refresh() {
    api
      .listRecycleBin()
      .then(setEntries)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the Recycle Bin'));
  }
  useEffect(refresh, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!entries || !q) return entries;
    return entries.filter((e) =>
      [e.typeLabel, e.label, e.customerName ?? '', e.deletedBy, e.alsoIncludes].some((s) => s.toLowerCase().includes(q)),
    );
  }, [entries, search]);

  async function restore(entry: RecycleBinEntry) {
    setBusyId(entry.id);
    setError(null);
    setNotice(null);
    try {
      await api.restoreRecycleBinEntry(entry.id);
      setNotice(`Restored ${entry.typeLabel.toLowerCase()} "${entry.label}"${entry.itemCount > 1 ? ` and ${entry.alsoIncludes}` : ''}.`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore');
    } finally {
      setBusyId(null);
    }
  }

  async function purge(entry: RecycleBinEntry) {
    setPurging(null);
    setBusyId(entry.id);
    setError(null);
    setNotice(null);
    try {
      await api.purgeRecycleBinEntry(entry.id);
      setNotice(`Permanently deleted ${entry.typeLabel.toLowerCase()} "${entry.label}".`);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setBusyId(null);
    }
  }

  async function empty() {
    setConfirmEmpty(false);
    setBusyId('*');
    setError(null);
    setNotice(null);
    try {
      await api.emptyRecycleBin();
      setNotice('Recycle Bin emptied.');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to empty the Recycle Bin');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card" data-no-collapse>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>Recycle Bin</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            Anything deleted (customers, pets, bookings, invoices, payments, forms, documents and everything else) is
            kept here until it's restored or permanently deleted. Restoring puts it back exactly as it was, including
            invoice and bank account balances, along with anything that was deleted with it.
            {!canPurge && ' Only admins can permanently delete.'}
          </p>
        </div>
        {canPurge && (
          <button
            className="btn btn-danger btn-sm"
            style={{ whiteSpace: 'nowrap' }}
            disabled={busyId !== null || !entries || entries.length === 0}
            onClick={() => setConfirmEmpty(true)}
          >
            Empty Recycle Bin
          </button>
        )}
      </div>

      {notice && <p style={{ fontSize: '0.9rem' }}>{notice}</p>}
      {error && <div className="error-banner">{error}</div>}

      {entries && entries.length > 0 && (
        <div className="field" style={{ maxWidth: 400 }}>
          <input
            type="text"
            placeholder="Search deleted items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {visible === null ? (
        <div className="empty-state">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="empty-state">{search ? 'Nothing matches that search.' : 'The Recycle Bin is empty.'}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Customer</th>
              <th>Deleted</th>
              <th>By</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <div>
                    <span style={{ color: 'var(--muted)' }}>{entry.typeLabel}:</span> <strong>{entry.label}</strong>
                  </div>
                  {entry.alsoIncludes && (
                    <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Also deleted with it: {entry.alsoIncludes}</div>
                  )}
                </td>
                <td>{entry.customerName || '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {new Date(entry.deletedAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td>{entry.deletedBy}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-secondary btn-sm" disabled={busyId !== null} onClick={() => restore(entry)}>
                    {busyId === entry.id ? 'Working…' : 'Restore'}
                  </button>
                  {canPurge && (
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ marginLeft: 8 }}
                      disabled={busyId !== null}
                      onClick={() => setPurging(entry)}
                    >
                      Delete forever
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {purging && (
        <Modal title="Permanently delete?" onClose={() => setPurging(null)}>
          <p>
            This permanently deletes {purging.typeLabel.toLowerCase()} <strong>{purging.label}</strong>
            {purging.alsoIncludes && <> and everything deleted with it ({purging.alsoIncludes})</>}. It can't be restored
            afterwards.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setPurging(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={() => purge(purging)}>
              Delete forever
            </button>
          </div>
        </Modal>
      )}

      {confirmEmpty && entries && (
        <Modal title="Empty the Recycle Bin?" onClose={() => setConfirmEmpty(false)}>
          <p>
            This permanently deletes all {entries.length} item{entries.length === 1 ? '' : 's'} in the Recycle Bin. None of
            them can be restored afterwards.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setConfirmEmpty(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={empty}>
              Empty Recycle Bin
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
