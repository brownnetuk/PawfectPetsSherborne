import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import { StaffSignOffPicker } from './PoliciesTab';
import type { TrainingModule } from '../types';

export default function TrainingAssignUsersModal({
  module: trainingModule,
  onClose,
  onSaved,
}: {
  module: TrainingModule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [staffOptions, setStaffOptions] = useState<{ _id: string; name: string }[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignAllStaff, setAssignAllStaff] = useState(trainingModule.assignAllStaff);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listTrainingStaffOptions().then(setStaffOptions);
    setSelected(new Set(trainingModule.assignments.map((a) => a.staff)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainingModule._id]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (assignAllStaff !== trainingModule.assignAllStaff) {
        await api.setTrainingModuleAssignAll(trainingModule._id, assignAllStaff);
      }
      await api.assignTrainingModuleUsers(trainingModule._id, Array.from(selected));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign users to this module');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Assign Users — ${trainingModule.name}`} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <div className="checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <input
          type="checkbox"
          id="training-assign-all"
          checked={assignAllStaff}
          onChange={(e) => setAssignAllStaff(e.target.checked)}
        />
        <label htmlFor="training-assign-all" style={{ fontWeight: 400, margin: 0 }}>
          Assign to all staff, including anyone added later
        </label>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -6 }}>
        {assignAllStaff
          ? 'Every active staff member is assigned. You can still pick individuals below for anyone joining outside "All Staff".'
          : 'Choose who this module applies to. Anyone already assigned keeps their progress and due date.'}
      </p>
      <StaffSignOffPicker staff={staffOptions} selected={selected} onToggle={toggle} />
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}
