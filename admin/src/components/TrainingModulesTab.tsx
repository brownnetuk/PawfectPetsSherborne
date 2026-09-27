import { useEffect, useState } from 'react';
import * as api from '../api/client';
import ActionsMenu from './ActionsMenu';
import Badge from './Badge';
import Modal from './Modal';
import { reviewFrequencyLabel } from './RiskAssessmentsTab';
import TrainingAssignUsersModal from './TrainingAssignUsersModal';
import TrainingModuleEditor from './TrainingModuleEditor';
import { PdfContentIcon, ReadingContentIcon, VideoContentIcon } from './icons';
import type { TrainingModule } from '../types';

export default function TrainingModulesTab() {
  const [modules, setModules] = useState<TrainingModule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState<{ mode: 'create' } | { mode: 'edit'; module: TrainingModule } | null>(null);
  const [assigning, setAssigning] = useState<TrainingModule | null>(null);
  const [deleting, setDeleting] = useState<TrainingModule | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    api
      .listTrainingModules()
      .then(setModules)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load training modules'));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteTrainingModule(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this module');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 style={{ fontSize: '1.2rem' }}>Training Modules</h1>
        <button className="btn btn-primary" onClick={() => setShowEditor({ mode: 'create' })}>
          + New Training Module
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {!modules ? (
          <div className="empty-state">Loading…</div>
        ) : modules.length === 0 ? (
          <div className="empty-state">No training modules yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Module</th>
                <th>Content</th>
                <th>Test</th>
                <th>Pass Mark</th>
                <th>Assigned</th>
                <th>Status</th>
                <th>Review</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m._id}>
                  <td>
                    <strong>{m.name}</strong>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {m.contentBlocks.some((b) => b.type === 'video') && (
                        <span title="Video" style={{ color: 'var(--brand-green-soft)' }}>
                          <VideoContentIcon />
                        </span>
                      )}
                      {m.contentBlocks.some((b) => b.type === 'reading') && (
                        <span title="Reading" style={{ color: 'var(--brand-green-soft)' }}>
                          <ReadingContentIcon />
                        </span>
                      )}
                      {m.contentBlocks.some((b) => b.type === 'pdf') && (
                        <span title="PDF" style={{ color: 'var(--brand-green-soft)' }}>
                          <PdfContentIcon />
                        </span>
                      )}
                      {m.contentBlocks.length === 0 && <span style={{ color: 'var(--muted)' }}>—</span>}
                    </div>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>
                    {m.questionsPerAttempt} of {m.questionBank.length} qs
                  </td>
                  <td>{m.passMarkPercent}%</td>
                  <td style={{ color: 'var(--muted)' }}>
                    {m.assignAllStaff ? 'All Staff' : `${m.assignments.length} staff`}
                  </td>
                  <td>
                    <Badge value={m.status} />
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{reviewFrequencyLabel(m.reviewFrequency)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <ActionsMenu
                      items={[
                        { label: 'Edit', onClick: () => setShowEditor({ mode: 'edit', module: m }) },
                        { label: 'Assign Users', onClick: () => setAssigning(m) },
                        { label: 'Delete', onClick: () => setDeleting(m), danger: true, dividerBefore: true },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showEditor && (
        <TrainingModuleEditor
          initial={showEditor.mode === 'edit' ? showEditor.module : undefined}
          onClose={() => setShowEditor(null)}
          onSaved={() => {
            setShowEditor(null);
            refresh();
          }}
        />
      )}

      {assigning && (
        <TrainingAssignUsersModal
          module={assigning}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title="Delete this training module?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently deletes <strong>{deleting.name}</strong>, its question bank, and every staff member's
            attempt history for it. This can't be undone.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete module'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
