import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import { RiskScoreBadge } from './RiskAssessmentDetailModal';
import { REVIEW_FREQUENCY_OPTIONS } from './RiskAssessmentsTab';
import type { ImportedRiskAssessmentDraft, ImportedRiskDraft, RiskAssessment } from '../types';

const MAX_DOCX_BYTES = 5 * 1024 * 1024;
const RATINGS = [1, 2, 3, 4, 5];

type Row = ImportedRiskDraft & { include: boolean };

// "Import from Word" (Risk Assessments list): upload one of the RA .docx
// documents, check/adjust what was read out of it, then create the
// assessment (as a draft) with all of its risks in one go. The backend does
// the reading (RiskAssessmentsService.previewImport()); anything it couldn't
// read -- most often a blank or non-numeric L/S cell -- has to be filled in
// here before Import is enabled.
export default function ImportRiskAssessmentModal({
  existing,
  onClose,
  onImported,
}: {
  existing: RiskAssessment[];
  onClose: () => void;
  onImported: (assessment: RiskAssessment) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [draft, setDraft] = useState<ImportedRiskAssessmentDraft | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [name, setName] = useState('');
  const [regulationReference, setRegulationReference] = useState('');
  const [reviewFrequency, setReviewFrequency] = useState('');
  const [assessmentDate, setAssessmentDate] = useState('');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [scope, setScope] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setError('Please choose a Word (.docx) file. Older .doc files need re-saving as .docx first.');
      return;
    }
    if (file.size > MAX_DOCX_BYTES) {
      setError('That file is too large — please use one under 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      setReading(true);
      try {
        const result = await api.previewRiskAssessmentImport(reader.result as string, file.name);
        setFileName(file.name);
        setDraft(result);
        setRows(result.risks.map((r) => ({ ...r, include: true })));
        setName(result.name);
        setRegulationReference(result.regulationReference ?? '');
        setReviewFrequency(result.reviewFrequency ?? '');
        setAssessmentDate(result.assessmentDate ?? '');
        setNextReviewDate(result.nextReviewDate ?? '');
        setScope(result.scope ?? '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read that document');
      } finally {
        setReading(false);
      }
    };
    reader.onerror = () => setError('Failed to read that file.');
    reader.readAsDataURL(file);
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const included = rows.filter((r) => r.include);
  const unrated = included.filter((r) => r.likelihood === null || r.severity === null).length;
  const duplicate = existing.find((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase());

  async function handleImport() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.importRiskAssessment({
        name: name.trim(),
        regulationReference: regulationReference.trim() || undefined,
        reviewFrequency: reviewFrequency || undefined,
        scope: scope.trim() || undefined,
        assessmentDate: assessmentDate || undefined,
        nextReviewDate: nextReviewDate || undefined,
        assessedBy: draft.assessedBy,
        fileName: fileName ?? undefined,
        risks: included.map((r) => ({
          hazard: r.hazard,
          whoAtRisk: r.whoAtRisk,
          existingControls: r.existingControls,
          furtherActions: r.furtherActions,
          likelihood: r.likelihood as number,
          severity: r.severity as number,
          residualRisk: r.residualRisk,
          reviewPeriod: r.reviewPeriod || reviewFrequency || undefined,
        })),
      });
      onImported(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import this risk assessment');
    } finally {
      setSaving(false);
    }
  }

  if (!draft) {
    return (
      <Modal title="Import Risk Assessment from Word" onClose={onClose}>
        {error && <div className="error-banner">{error}</div>}
        <p>
          Choose a risk assessment Word document (.docx). Its title, introduction, hazards table and
          &ldquo;Assessed by / Date assessed / Next review&rdquo; details are read in, and you can check and
          adjust everything before it's saved.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          The hazards table needs a header row naming its columns (e.g. Hazard, Who might be harmed, Existing
          controls, L, S, Risk, Further action needed). Column order doesn't matter.
        </p>
        <div className="field">
          <input type="file" accept=".docx" onChange={handleFileChange} disabled={reading} />
          {reading && <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Reading document…</span>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Import "${fileName}"`} onClose={onClose} full>
      {error && <div className="error-banner">{error}</div>}
      {draft.warnings.map((w, i) => (
        <div key={i} className="error-banner">
          {w}
        </div>
      ))}
      {duplicate && (
        <div className="error-banner">
          There's already an assessment called &ldquo;{duplicate.name}&rdquo; ({duplicate.raId}). Importing creates a
          separate one — delete the old one afterwards if this replaces it.
        </div>
      )}

      <div className="field">
        <label>Assessment Name *</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Regulation Reference</label>
          <input type="text" value={regulationReference} onChange={(e) => setRegulationReference(e.target.value)} />
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
      <div className="field-row">
        <div className="field">
          <label>Assessment Date</label>
          <input type="date" value={assessmentDate} onChange={(e) => setAssessmentDate(e.target.value)} />
          <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Leave blank to use today</span>
        </div>
        <div className="field">
          <label>Next Review Date</label>
          <input type="date" value={nextReviewDate} onChange={(e) => setNextReviewDate(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Scope</label>
        <textarea value={scope} onChange={(e) => setScope(e.target.value)} rows={3} />
      </div>
      {draft.assessedBy && (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -4 }}>
          Assessed by {draft.assessedBy} (kept in the assessment's audit log).
        </p>
      )}

      <h3 style={{ marginBottom: 4 }}>
        Risks ({included.length} of {rows.length} selected)
      </h3>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 0 }}>
        Untick any row you don't want. Wording can be edited after import from the assessment itself.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Hazard / Risk</th>
              <th>Who At Risk</th>
              <th>Existing Controls</th>
              <th>Further Actions</th>
              <th>L</th>
              <th>S</th>
              <th>Score</th>
              <th>Residual Risk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={r.include ? undefined : { opacity: 0.45 }}>
                <td>
                  <input
                    type="checkbox"
                    checked={r.include}
                    onChange={(e) => updateRow(i, { include: e.target.checked })}
                    aria-label={`Include ${r.hazard}`}
                  />
                </td>
                <td>
                  <strong>{r.hazard}</strong>
                </td>
                <td>{r.whoAtRisk || '—'}</td>
                <td>
                  <ItemList items={r.existingControls} />
                </td>
                <td>
                  <ItemList items={r.furtherActions} />
                </td>
                <td>
                  <RatingSelect value={r.likelihood} onChange={(v) => updateRow(i, { likelihood: v })} />
                </td>
                <td>
                  <RatingSelect value={r.severity} onChange={(v) => updateRow(i, { severity: v })} />
                </td>
                <td>
                  {r.likelihood !== null && r.severity !== null ? (
                    <RiskScoreBadge likelihood={r.likelihood} severity={r.severity} />
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <select
                    value={r.residualRisk}
                    onChange={(e) => updateRow(i, { residualRisk: e.target.value as Row['residualRisk'] })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="modal-actions">
        {unrated > 0 && (
          <span style={{ color: 'var(--error)', fontSize: '0.85rem', marginRight: 'auto' }}>
            Set L and S for {unrated} risk{unrated === 1 ? '' : 's'} to continue
          </span>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setDraft(null);
            setError(null);
          }}
          disabled={saving}
        >
          Choose another file
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleImport}
          disabled={saving || !name.trim() || unrated > 0}
        >
          {saving ? 'Importing…' : `Import as draft (${included.length} risk${included.length === 1 ? '' : 's'})`}
        </button>
      </div>
    </Modal>
  );
}

function ItemList({ items }: { items: string[] }) {
  if (items.length === 0) return <>—</>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((item, j) => (
        <li key={j}>{item}</li>
      ))}
    </ul>
  );
}

function RatingSelect({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      style={value === null ? { borderColor: 'var(--error)' } : undefined}
    >
      {value === null && <option value="">?</option>}
      {RATINGS.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}
