import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { MAX_OBSERVATION_PHOTOS, OBSERVATION_CATEGORIES } from '../types';
import type { BookingObservation, ObservationCategory } from '../types';
import { compressImageToDataUrl } from '../utils/compressImage';
import Modal from './Modal';
import { PencilIcon, TrashIcon } from './icons';

const CATEGORY_COLORS: Record<ObservationCategory, { background: string; color: string }> = {
  Toilet: { background: '#fef3c7', color: '#92400e' },
  Play: { background: '#dcfce7', color: '#166534' },
  Medication: { background: '#fee2e2', color: '#991b1b' },
  Feed: { background: '#ffedd5', color: '#9a3412' },
  Groom: { background: '#ede9fe', color: '#5b21b6' },
  General: { background: '#e0f2fe', color: '#075985' },
};

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm", not an ISO string.
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Care notes (Toilet/Play/Medication/...) logged against a Boarding & Day
// Care booking -- shown on its Booking Detail page, as many as staff like.
export default function ObservationsCard({ bookingId, readOnly }: { bookingId: string; readOnly?: boolean }) {
  const [observations, setObservations] = useState<BookingObservation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null = closed, 'new' = adding, otherwise the observation being edited.
  const [editing, setEditing] = useState<BookingObservation | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BookingObservation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  function refresh() {
    api
      .listBookingObservations(bookingId)
      .then(setObservations)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load observations'));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [bookingId]);

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.deleteBookingObservation(bookingId, confirmDelete._id);
      setConfirmDelete(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete that observation');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>
          Observations{observations && observations.length > 0 ? ` (${observations.length})` : ''}
        </div>
        {!readOnly && (
          <button className="btn btn-secondary" onClick={() => setEditing('new')}>
            Add observation
          </button>
        )}
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!observations ? (
        <div className="empty-state">Loading…</div>
      ) : observations.length === 0 ? (
        <div className="empty-state">No observations yet.</div>
      ) : (
        observations.map((o) => (
          <div key={o._id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 10px',
                    borderRadius: 999,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    ...CATEGORY_COLORS[o.category],
                  }}
                >
                  {o.category}
                </span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  {new Date(o.observedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>by {o.observedBy}</span>
              </div>
              {!readOnly && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-link" title="Edit" onClick={() => setEditing(o)}>
                    <PencilIcon />
                  </button>
                  <button className="btn-link" title="Delete" onClick={() => setConfirmDelete(o)}>
                    <TrashIcon />
                  </button>
                </div>
              )}
            </div>
            {o.description && (
              <div style={{ fontSize: '0.88rem', marginTop: 6, whiteSpace: 'pre-wrap' }}>{o.description}</div>
            )}
            {o.photos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {o.photos.map((p, i) => (
                  <img
                    key={i}
                    src={p}
                    alt={`Photo ${i + 1}`}
                    onClick={() => setViewPhoto(p)}
                    style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}
                  />
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {editing && (
        <ObservationFormModal
          bookingId={bookingId}
          observation={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {confirmDelete && (
        <Modal title="Delete this observation?" onClose={() => setConfirmDelete(null)}>
          <p>
            This removes the {confirmDelete.category} observation from{' '}
            {new Date(confirmDelete.observedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            {confirmDelete.photos.length > 0 ? ', including its photos' : ''}.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
      {viewPhoto && (
        <Modal title="Photo" xl onClose={() => setViewPhoto(null)}>
          <img src={viewPhoto} alt="" style={{ display: 'block', maxWidth: '100%', maxHeight: '75vh', margin: '0 auto' }} />
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setViewPhoto(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ObservationFormModal({
  bookingId,
  observation,
  onClose,
  onSaved,
}: {
  bookingId: string;
  observation: BookingObservation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { staff } = useAuth();
  const [observedAt, setObservedAt] = useState(() =>
    toLocalInputValue(observation ? new Date(observation.observedAt) : new Date()),
  );
  const [category, setCategory] = useState<ObservationCategory | ''>(observation?.category ?? '');
  const [description, setDescription] = useState(observation?.description ?? '');
  const [photos, setPhotos] = useState<string[]>(observation?.photos ?? []);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setError(null);
    const room = MAX_OBSERVATION_PHOTOS - photos.length;
    if (files.length > room) {
      setError(`You can add up to ${MAX_OBSERVATION_PHOTOS} photos, so only the first ${room} were added.`);
    }
    setProcessing(true);
    try {
      const added: string[] = [];
      for (const file of files.slice(0, room)) {
        if (!file.type.startsWith('image/')) {
          setError('Please choose image files only.');
          continue;
        }
        if (file.size > 15 * 1024 * 1024) {
          setError('Each photo must be under 15 MB.');
          continue;
        }
        // Downscaled/re-encoded so five phone photos stay well under the
        // API's request size limit.
        added.push(await compressImageToDataUrl(file));
      }
      setPhotos((prev) => [...prev, ...added].slice(0, MAX_OBSERVATION_PHOTOS));
    } catch {
      setError('Could not read one of those images.');
    } finally {
      setProcessing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) {
      setError('Please choose a type.');
      return;
    }
    const when = new Date(observedAt);
    if (Number.isNaN(when.getTime())) {
      setError('Please enter a valid date and time.');
      return;
    }
    setSaving(true);
    setError(null);
    const input: api.BookingObservationInput = {
      observedAt: when.toISOString(),
      category,
      description: description.trim() || undefined,
      photos,
    };
    try {
      if (observation) {
        await api.updateBookingObservation(bookingId, observation._id, input);
      } else {
        await api.createBookingObservation(bookingId, input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save this observation');
      setSaving(false);
    }
  }

  return (
    <Modal title={observation ? 'Edit observation' : 'Add observation'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Date / time</label>
            <input type="datetime-local" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} required />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as ObservationCategory)} required>
              <option value="" disabled>
                Choose…
              </option>
              {OBSERVATION_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Description</label>
          <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label>
            Photos ({photos.length}/{MAX_OBSERVATION_PHOTOS})
          </label>
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img
                    src={p}
                    alt={`Photo ${i + 1}`}
                    style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', display: 'block' }}
                  />
                  <button
                    type="button"
                    className="btn-link"
                    style={{ fontSize: '0.78rem' }}
                    onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < MAX_OBSERVATION_PHOTOS ? (
            <input type="file" accept="image/*" multiple onChange={handlePhotoChange} disabled={processing} />
          ) : (
            <div className="hint">You've added the maximum of {MAX_OBSERVATION_PHOTOS} photos.</div>
          )}
          {processing && <div className="hint">Preparing photos…</div>}
        </div>
        <div className="field">
          <label>Observed by</label>
          <input type="text" value={observation ? observation.observedBy : (staff?.name ?? 'Staff')} readOnly disabled />
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || processing}>
            {saving ? 'Saving…' : observation ? 'Save changes' : 'Add observation'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
