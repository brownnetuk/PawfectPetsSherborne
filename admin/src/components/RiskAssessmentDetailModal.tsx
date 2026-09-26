import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { RiskItemInput } from '../api/client';
import Badge from './Badge';
import Modal from './Modal';
import { TrashIcon } from './icons';
import { REVIEW_FREQUENCY_OPTIONS, reviewFrequencyLabel, RiskAssessmentFormModal } from './RiskAssessmentsTab';
import type { RiskAssessment, RiskItem } from '../types';

const LIKELIHOOD_LABELS = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'];
const SEVERITY_LABELS = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

const LABEL_CAPTION_STYLE: React.CSSProperties = {
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--muted)',
  fontWeight: 700,
  marginBottom: 4,
};

function scoreBand(score: number): 'low' | 'medium' | 'high' {
  if (score <= 6) return 'low';
  if (score <= 14) return 'medium';
  return 'high';
}

function RiskScoreBadge({ likelihood, severity }: { likelihood: number; severity: number }) {
  const score = likelihood * severity;
  const band = scoreBand(score);
  return <span className={`badge badge-${band}`}>{score} - {band.toUpperCase()}</span>;
}

export default function RiskAssessmentDetailModal({
  assessmentId,
  onClose,
  onChanged,
}: {
  assessmentId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showRiskForm, setShowRiskForm] = useState<{ mode: 'create' } | { mode: 'edit'; risk: RiskItem } | null>(
    null,
  );
  const [deletingRisk, setDeletingRisk] = useState<RiskItem | null>(null);
  const [busy, setBusy] = useState(false);

  function refresh() {
    api
      .getRiskAssessment(assessmentId)
      .then(setAssessment)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this risk assessment'));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [assessmentId]);

  async function handleReviewPolicy() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.reviewRiskAssessmentPolicy(assessmentId);
      setAssessment(updated);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record the review');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteRisk() {
    if (!deletingRisk) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.deleteRiskItem(assessmentId, deletingRisk._id);
      setAssessment(updated);
      setDeletingRisk(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete this risk');
    } finally {
      setBusy(false);
    }
  }

  if (!assessment) {
    return (
      <Modal title="Risk Assessment" onClose={onClose} xl>
        {error && <div className="error-banner">{error}</div>}
        <div className="empty-state">Loading…</div>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        title={assessment.name}
        onClose={onClose}
        xl
        headerActions={
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAudit(true)}>
              Audit
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleReviewPolicy} disabled={busy}>
              {busy ? 'Working…' : 'Review Policy'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowEditDetails(true)}>
              Edit Details
            </button>
          </>
        }
      >
        {error && <div className="error-banner">{error}</div>}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 14,
            padding: '10px 0 16px',
            borderBottom: '1px solid var(--border)',
            marginBottom: 16,
          }}
        >
          {(
            [
              ['RA ID', <strong key="v">{assessment.raId}</strong>],
              ['Assessment Date', new Date(assessment.assessmentDate).toLocaleDateString('en-GB')],
              ['Review Frequency', reviewFrequencyLabel(assessment.reviewFrequency)],
              [
                'Next Review Date',
                assessment.nextReviewDate ? new Date(assessment.nextReviewDate).toLocaleDateString('en-GB') : '—',
              ],
              ['Status', <Badge key="v" value={assessment.status} />],
              ['Regulation Reference', assessment.regulationReference || '—', 2],
              ['Scope', assessment.scope || '—', 2],
            ] as [string, React.ReactNode, number?][]
          ).map(([label, value, span]) => (
            <div key={label} style={span ? { gridColumn: `span ${span}` } : undefined}>
              <div style={LABEL_CAPTION_STYLE}>{label}</div>
              {value}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Risks</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowRiskForm({ mode: 'create' })}>
            + New Risk
          </button>
        </div>

        {assessment.risks.length === 0 ? (
          <div className="empty-state">No risks recorded yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Hazard / Risk</th>
                  <th>Who At Risk</th>
                  <th>Existing Controls</th>
                  <th>Further Actions</th>
                  <th>L</th>
                  <th>S</th>
                  <th>Score</th>
                  <th>Residual Risk</th>
                  <th>Review</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assessment.risks.map((r, i) => (
                  <tr key={r._id}>
                    <td>{i + 1}</td>
                    <td>
                      <strong>{r.hazard}</strong>
                    </td>
                    <td>{r.whoAtRisk || '—'}</td>
                    <td>
                      {r.existingControls.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {r.existingControls.map((c, j) => (
                            <li key={j}>{c}</li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {r.furtherActions.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {r.furtherActions.map((a, j) => (
                            <li key={j}>{a}</li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{r.likelihood}</td>
                    <td>{r.severity}</td>
                    <td>
                      <RiskScoreBadge likelihood={r.likelihood} severity={r.severity} />
                    </td>
                    <td>
                      <Badge value={r.residualRisk} />
                    </td>
                    <td>{reviewFrequencyLabel(r.reviewPeriod)}</td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowRiskForm({ mode: 'edit', risk: r })}
                      >
                        Edit
                      </button>{' '}
                      <button className="btn btn-danger btn-sm" onClick={() => setDeletingRisk(r)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {showEditDetails && (
        <RiskAssessmentFormModal
          initial={assessment}
          nextIdHint={assessment.raId}
          onClose={() => setShowEditDetails(false)}
          onSaved={(updated) => {
            setAssessment(updated);
            setShowEditDetails(false);
            onChanged();
          }}
        />
      )}

      {showRiskForm && (
        <EditRiskModal
          assessmentId={assessmentId}
          initial={showRiskForm.mode === 'edit' ? showRiskForm.risk : undefined}
          onClose={() => setShowRiskForm(null)}
          onSaved={(updated) => {
            setAssessment(updated);
            setShowRiskForm(null);
            onChanged();
          }}
        />
      )}

      {deletingRisk && (
        <Modal title="Delete this risk?" onClose={() => setDeletingRisk(null)}>
          <p>
            This permanently removes <strong>{deletingRisk.hazard}</strong> from this assessment.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeletingRisk(null)} disabled={busy}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDeleteRisk} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete risk'}
            </button>
          </div>
        </Modal>
      )}

      {showAudit && (
        <Modal title={`Audit Log — ${assessment.name}`} onClose={() => setShowAudit(false)} wide>
          {assessment.auditLog.length === 0 ? (
            <div className="empty-state">No changes logged yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Changed By</th>
                  <th>Action</th>
                  <th>Changes Made</th>
                </tr>
              </thead>
              <tbody>
                {[...assessment.auditLog]
                  .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                  .map((entry, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(entry.at).toLocaleString('en-GB')}
                      </td>
                      <td>{entry.actor}</td>
                      <td>{entry.action}</td>
                      <td>{entry.changes || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </>
  );
}

function StringListEditor({
  label,
  addLabel,
  values,
  onChange,
}: {
  label: string;
  addLabel: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {values.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input
            type="text"
            value={v}
            onChange={(e) => {
              const next = [...values];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            title="Remove"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <button type="button" className="btn-link" onClick={() => onChange([...values, ''])}>
        {addLabel}
      </button>
    </div>
  );
}

function EditRiskModal({
  assessmentId,
  initial,
  onClose,
  onSaved,
}: {
  assessmentId: string;
  initial?: RiskItem;
  onClose: () => void;
  onSaved: (assessment: RiskAssessment) => void;
}) {
  const [hazard, setHazard] = useState(initial?.hazard ?? '');
  const [whoAtRisk, setWhoAtRisk] = useState(initial?.whoAtRisk ?? '');
  const [existingControls, setExistingControls] = useState<string[]>(initial?.existingControls ?? []);
  const [furtherActions, setFurtherActions] = useState<string[]>(initial?.furtherActions ?? []);
  const [likelihood, setLikelihood] = useState(initial?.likelihood ?? 1);
  const [severity, setSeverity] = useState(initial?.severity ?? 1);
  const [residualRisk, setResidualRisk] = useState(initial?.residualRisk ?? 'low');
  const [reviewPeriod, setReviewPeriod] = useState(initial?.reviewPeriod ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: RiskItemInput = {
        hazard,
        whoAtRisk: whoAtRisk || undefined,
        existingControls: existingControls.filter((c) => c.trim() !== ''),
        furtherActions: furtherActions.filter((a) => a.trim() !== ''),
        likelihood,
        severity,
        residualRisk,
        reviewPeriod: reviewPeriod || undefined,
      };
      const updated = initial
        ? await api.updateRiskItem(assessmentId, initial._id, input)
        : await api.addRiskItem(assessmentId, input);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save this risk');
    } finally {
      setSaving(false);
    }
  }

  const score = likelihood * severity;
  const band = scoreBand(score);

  return (
    <Modal title={initial ? 'Edit Risk' : 'New Risk'} onClose={onClose} wide>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Hazard / Risk *</label>
            <input type="text" value={hazard} onChange={(e) => setHazard(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>Who at Risk</label>
            <input type="text" value={whoAtRisk} onChange={(e) => setWhoAtRisk(e.target.value)} />
          </div>
        </div>

        <StringListEditor
          label="Existing Controls"
          addLabel="+ Add control"
          values={existingControls}
          onChange={setExistingControls}
        />

        <div className="field-row">
          <div className="field">
            <label>Likelihood (1-5)</label>
            <select value={likelihood} onChange={(e) => setLikelihood(Number(e.target.value))}>
              {LIKELIHOOD_LABELS.map((label, i) => (
                <option key={i} value={i + 1}>
                  {i + 1} - {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Severity (1-5)</label>
            <select value={severity} onChange={(e) => setSeverity(Number(e.target.value))}>
              {SEVERITY_LABELS.map((label, i) => (
                <option key={i} value={i + 1}>
                  {i + 1} - {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Risk Score</label>
            <div>
              <span className={`badge badge-${band}`}>{score} - {band.toUpperCase()}</span>
            </div>
          </div>
        </div>

        <StringListEditor
          label="Further Action Required"
          addLabel="+ Add action"
          values={furtherActions}
          onChange={setFurtherActions}
        />

        <div className="field-row">
          <div className="field">
            <label>Residual Risk</label>
            <select value={residualRisk} onChange={(e) => setResidualRisk(e.target.value as RiskItem['residualRisk'])}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="field">
            <label>Review Period</label>
            <select value={reviewPeriod} onChange={(e) => setReviewPeriod(e.target.value)}>
              <option value="">-- Select --</option>
              {REVIEW_FREQUENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
