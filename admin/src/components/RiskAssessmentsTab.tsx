import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Badge from './Badge';
import Modal from './Modal';
import RiskAssessmentDetailModal, { ReviewRiskAssessmentModal } from './RiskAssessmentDetailModal';
import type { RiskAssessment } from '../types';

export const REVIEW_FREQUENCY_OPTIONS: { value: string; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: '6-monthly', label: '6-Monthly' },
  { value: 'annually', label: 'Annually' },
];

export function reviewFrequencyLabel(value?: string): string {
  return REVIEW_FREQUENCY_OPTIONS.find((o) => o.value === value)?.label ?? '—';
}

export default function RiskAssessmentsTab() {
  const [assessments, setAssessments] = useState<RiskAssessment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState<{ mode: 'create' } | { mode: 'edit'; assessment: RiskAssessment } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<RiskAssessment | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  function refresh() {
    api
      .listRiskAssessments()
      .then(setAssessments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load risk assessments'));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteRiskAssessment(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this risk assessment');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Risk Assessments</h1>
        <button className="btn btn-primary" onClick={() => setShowForm({ mode: 'create' })}>
          + Create Risk Assessment
        </button>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -8 }}>
        Double-click a row to open the full risk assessment and manage individual risks.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {!assessments ? (
          <div className="empty-state">Loading…</div>
        ) : assessments.length === 0 ? (
          <div className="empty-state">No risk assessments yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>RA ID</th>
                <th>Assessment Name</th>
                <th>Regulation Reference</th>
                <th>Review Frequency</th>
                <th>Next Review Date</th>
                <th>Status</th>
                <th>Risks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assessments.map((ra) => (
                <tr key={ra._id} onDoubleClick={() => setOpenId(ra._id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <strong>{ra.raId}</strong>
                  </td>
                  <td>{ra.name}</td>
                  <td style={{ color: 'var(--muted)' }}>{ra.regulationReference || '—'}</td>
                  <td>{reviewFrequencyLabel(ra.reviewFrequency)}</td>
                  <td>{ra.nextReviewDate ?? '—'}</td>
                  <td>
                    <Badge value={ra.status} />
                  </td>
                  <td>{ra.risks.length}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setReviewingId(ra._id)}>
                      Review
                    </button>{' '}
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowForm({ mode: 'edit', assessment: ra })}>
                      Edit
                    </button>{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleting(ra)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <RiskAssessmentFormModal
          initial={showForm.mode === 'edit' ? showForm.assessment : undefined}
          nextIdHint={`RA${(assessments?.length ?? 0) + 1}`}
          onClose={() => setShowForm(null)}
          onSaved={() => {
            setShowForm(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title="Delete this risk assessment?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently deletes <strong>{deleting.name}</strong> ({deleting.raId}) and all {deleting.risks.length}{' '}
            of its risks. This can't be undone.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete assessment'}
            </button>
          </div>
        </Modal>
      )}

      {openId && (
        <RiskAssessmentDetailModal
          assessmentId={openId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
        />
      )}

      {reviewingId && (
        <ReviewRiskAssessmentModal
          assessmentId={reviewingId}
          onClose={() => setReviewingId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

export function RiskAssessmentFormModal({
  initial,
  nextIdHint,
  onClose,
  onSaved,
}: {
  initial?: RiskAssessment;
  nextIdHint: string;
  onClose: () => void;
  onSaved: (assessment: RiskAssessment) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [regulationReference, setRegulationReference] = useState(initial?.regulationReference ?? '');
  const [reviewFrequency, setReviewFrequency] = useState(initial?.reviewFrequency ?? '');
  const [scope, setScope] = useState(initial?.scope ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input = {
        name,
        regulationReference: regulationReference || undefined,
        reviewFrequency: reviewFrequency || undefined,
        scope: scope || undefined,
        status,
      };
      const saved = initial
        ? await api.updateRiskAssessment(initial._id, input)
        : await api.createRiskAssessment(input);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save this risk assessment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={initial ? 'Edit Risk Assessment' : 'Create Risk Assessment'} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Risk Assessment ID</label>
            <input type="text" value={initial?.raId ?? nextIdHint} disabled />
            <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Auto-assigned on save</span>
          </div>
          <div className="field">
            <label>Assessment Date</label>
            <input
              type="text"
              value={initial ? new Date(initial.assessmentDate).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB')}
              disabled
            />
            <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Set on creation</span>
          </div>
        </div>
        <div className="field">
          <label>Assessment Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Home Boarding Risk Assessment"
            required
            autoFocus
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Regulation Reference</label>
            <input
              type="text"
              value={regulationReference}
              onChange={(e) => setRegulationReference(e.target.value)}
              placeholder="e.g. Health & Safety at Work Act"
            />
          </div>
          <div className="field">
            <label>Review Frequency</label>
            <select value={reviewFrequency} onChange={(e) => setReviewFrequency(e.target.value)}>
              <option value="">-- Select --</option>
              {REVIEW_FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Scope</label>
          <textarea
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="Describe what areas / activities this assessment covers…"
            rows={3}
          />
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as RiskAssessment['status'])}>
            <option value="draft">Draft</option>
            <option value="review">Review</option>
            <option value="live">Live</option>
          </select>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Assessment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
