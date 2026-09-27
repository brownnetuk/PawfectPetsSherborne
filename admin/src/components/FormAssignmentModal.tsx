import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { BoardingWorkflowSettings, FormRecord } from '../types';

type SlotKey = 'preCheckInFormBoarding' | 'preCheckInFormDayCare' | 'checkInFormBoarding' | 'checkInFormDayCare' | 'checkOutFormBoarding' | 'checkOutFormDayCare';

const SLOTS: { key: SlotKey; group: string; label: string }[] = [
  { key: 'preCheckInFormBoarding', group: 'Pre-check-in', label: 'Boarding' },
  { key: 'preCheckInFormDayCare', group: 'Pre-check-in', label: 'Day Care' },
  { key: 'checkInFormBoarding', group: 'Check-in', label: 'Boarding' },
  { key: 'checkInFormDayCare', group: 'Check-in', label: 'Day Care' },
  { key: 'checkOutFormBoarding', group: 'Check-out', label: 'Boarding' },
  { key: 'checkOutFormDayCare', group: 'Check-out', label: 'Day Care' },
];

// Which Boarding-workflow slots (Settings > Boarding) a given form currently
// fills -- e.g. for a "Used for" summary on the Forms list, without staff
// needing to cross-reference a separate settings tab.
export function slotsUsingForm(settings: BoardingWorkflowSettings | null, formId: string): string[] {
  if (!settings) return [];
  return SLOTS.filter((s) => settings[s.key] === formId).map((s) => `${s.group} (${s.label})`);
}

export default function FormAssignmentModal({
  form,
  settings,
  onClose,
  onSaved,
}: {
  form: FormRecord;
  settings: BoardingWorkflowSettings;
  onClose: () => void;
  onSaved: (settings: BoardingWorkflowSettings) => void;
}) {
  const [checked, setChecked] = useState<Set<SlotKey>>(
    new Set(SLOTS.filter((s) => settings[s.key] === form._id).map((s) => s.key)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: SlotKey) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Only touches slots that either point at this form or are being
      // newly assigned to it -- a slot currently pointing at a different
      // form is left alone unless its own checkbox here is ticked.
      const patch: Partial<BoardingWorkflowSettings> = {};
      for (const slot of SLOTS) {
        const isChecked = checked.has(slot.key);
        const currentlyThisForm = settings[slot.key] === form._id;
        if (isChecked && !currentlyThisForm) patch[slot.key] = form._id;
        else if (!isChecked && currentlyThisForm) patch[slot.key] = null;
      }
      const updated = await api.updateBoardingWorkflowSettings(patch);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the assignment');
    } finally {
      setSaving(false);
    }
  }

  const groups = Array.from(new Set(SLOTS.map((s) => s.group)));

  return (
    <Modal title={`Use "${form.name}" for…`} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -6 }}>
        Choosing a form here replaces whatever was previously assigned to that slot in Settings &gt;
        Boarding.
      </p>
      {groups.map((group) => (
        <div key={group} style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>{group}</div>
          {SLOTS.filter((s) => s.group === group).map((slot) => (
            <label key={slot.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontWeight: 400 }}>
              <input type="checkbox" checked={checked.has(slot.key)} onChange={() => toggle(slot.key)} />
              {slot.label}
            </label>
          ))}
        </div>
      ))}
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
