import { SelectField, TextField } from './fields';
import type { MedicationEntry } from '../types';

interface Props {
  medications: MedicationEntry[];
  onChange: (medications: MedicationEntry[]) => void;
}

const YES_NO: { value: 'yes' | 'no'; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

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
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <strong style={{ fontSize: '0.9rem' }}>Medication {i + 1}</strong>
            <button type="button" className="btn-link" onClick={() => removeEntry(i)}>
              Remove
            </button>
          </div>
          <TextField
            label="Medication Name"
            value={m.name}
            onChange={(v) => updateEntry(i, { name: v })}
            required
          />
          <TextField
            label="Illness treating"
            value={m.illnessTreating ?? ''}
            onChange={(v) => updateEntry(i, { illnessTreating: v })}
          />
          <div className="grid-2">
            <TextField label="Dosage" value={m.dosage ?? ''} onChange={(v) => updateEntry(i, { dosage: v })} />
            <TextField
              label="Frequency"
              value={m.frequency ?? ''}
              onChange={(v) => updateEntry(i, { frequency: v })}
            />
          </div>
          <div className="grid-2">
            <SelectField
              label="Vet Prescribed"
              value={m.vetPrescribed ? 'yes' : 'no'}
              options={YES_NO}
              onChange={(v) => updateEntry(i, { vetPrescribed: v === 'yes' })}
              required
            />
            <SelectField
              label="Pawfect Pets To administer"
              value={m.administeredByPawfectPets ? 'yes' : 'no'}
              options={YES_NO}
              onChange={(v) => updateEntry(i, { administeredByPawfectPets: v === 'yes' })}
              required
            />
          </div>
          <TextField
            label="Additional Info"
            value={m.additionalInfo ?? ''}
            onChange={(v) => updateEntry(i, { additionalInfo: v })}
          />
        </div>
      ))}
      <button type="button" className="btn-link" onClick={addEntry}>
        + Add Medication
      </button>
    </div>
  );
}
