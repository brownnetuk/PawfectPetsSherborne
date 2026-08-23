import type { MedicationEntry } from '../types';

interface Props {
  medications: MedicationEntry[];
  onChange: (medications: MedicationEntry[]) => void;
}

function emptyMedication(): MedicationEntry {
  return {
    name: '',
    illnessTreating: '',
    dosage: '',
    frequency: '',
    vetPrescribed: false,
    administeredByPawfectPets: false,
    additionalInfo: '',
  };
}

export default function MedicationEntriesField({ medications, onChange }: Props) {
  function updateEntry(i: number, patch: Partial<MedicationEntry>) {
    onChange(medications.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function removeEntry(i: number) {
    onChange(medications.filter((_, idx) => idx !== i));
  }

  function addEntry() {
    onChange([...medications, emptyMedication()]);
  }

  return (
    <div>
      {medications.map((m, i) => (
        <div key={i} className="card" style={{ marginBottom: 12, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: '0.85rem' }}>Medication {i + 1}</strong>
            <button type="button" className="btn-link" onClick={() => removeEntry(i)}>
              Remove
            </button>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Medication Name *</label>
              <input
                type="text"
                value={m.name}
                onChange={(e) => updateEntry(i, { name: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Illness treating</label>
              <input
                type="text"
                value={m.illnessTreating ?? ''}
                onChange={(e) => updateEntry(i, { illnessTreating: e.target.value })}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Dosage</label>
              <input
                type="text"
                value={m.dosage ?? ''}
                onChange={(e) => updateEntry(i, { dosage: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Frequency</label>
              <input
                type="text"
                value={m.frequency ?? ''}
                onChange={(e) => updateEntry(i, { frequency: e.target.value })}
              />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Vet Prescribed</label>
              <select
                value={m.vetPrescribed ? 'yes' : 'no'}
                onChange={(e) => updateEntry(i, { vetPrescribed: e.target.value === 'yes' })}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div className="field">
              <label>Pawfect Pets To administer</label>
              <select
                value={m.administeredByPawfectPets ? 'yes' : 'no'}
                onChange={(e) => updateEntry(i, { administeredByPawfectPets: e.target.value === 'yes' })}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Additional Info</label>
            <input
              type="text"
              value={m.additionalInfo ?? ''}
              onChange={(e) => updateEntry(i, { additionalInfo: e.target.value })}
            />
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={addEntry}>
        + Add Medication
      </button>
    </div>
  );
}
