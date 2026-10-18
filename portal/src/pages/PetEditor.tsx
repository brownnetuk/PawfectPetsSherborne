import { useState, type FormEvent, type ReactNode } from 'react';
import { updateAnimal } from '../api';
import type { AnimalRecord, MedicationEntry, PetFields, TriState } from '../types';

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];
const TRI = [...YES_NO, { value: 'unsure', label: 'Unsure' }];

// Dates are stored as local midnight (UK), so read them back in local time --
// slicing the ISO string would show the day before during BST.
function toInputDate(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function ageFrom(dob: string): number {
  const d = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) {
    years -= 1;
  }
  return Math.max(0, years);
}

const blankMedication = (): MedicationEntry => ({
  name: '',
  vetPrescribed: false,
  administeredByPawfectPets: false,
});

// Builds a PATCH body the backend's CreateAnimalDto rules accept: each
// yes/no is sent with its details (only when they apply), dates only when
// filled in, and the cat/dog-only questions only for those species.
function toPayload(f: PetFields, species: AnimalRecord['species']): Partial<PetFields> {
  const isDog = species === 'dog';
  const isCat = species === 'cat';
  const p: Partial<PetFields> = {
    name: f.name.trim(),
    breed: f.breed.trim(),
    sex: f.sex,
    age: f.dateOfBirth ? ageFrom(f.dateOfBirth) : f.age,
    colourMarkings: f.colourMarkings ?? '',
    microchipNumber: f.microchipNumber ?? '',
    temperamentNotes: f.temperamentNotes ?? '',
    vaccinated: f.vaccinated,
    insured: f.insured ?? false,
    aggressionToPeople: f.aggressionToPeople,
    allergies:
      f.allergies.status === 'no'
        ? { status: 'no' }
        : { status: f.allergies.status, details: f.allergies.details ?? '' },
    medication: f.medication.onMedication
      ? { onMedication: true, medications: f.medication.medications ?? [] }
      : { onMedication: false },
  };
  if (f.dateOfBirth) p.dateOfBirth = f.dateOfBirth;
  if (f.vaccinated) p.vaccineExpiryDate = f.vaccineExpiryDate;
  if (f.insured) p.insurer = f.insurer;
  if (f.neuteredStatus) p.neuteredStatus = f.neuteredStatus;
  if (f.lastSeasonEndDate && f.sex === 'female' && f.neuteredStatus === 'no') {
    p.lastSeasonEndDate = f.lastSeasonEndDate;
  }
  if (f.aggressionToPeople) p.aggressionToPeopleDetails = f.aggressionToPeopleDetails;
  if (!isCat) {
    if (f.aggressionToOtherAnimals !== undefined) {
      p.aggressionToOtherAnimals = f.aggressionToOtherAnimals;
      if (f.aggressionToOtherAnimals) p.aggressionToOtherAnimalsDetails = f.aggressionToOtherAnimalsDetails;
    }
    if (f.travelsWellInCar) {
      p.travelsWellInCar = f.travelsWellInCar;
      if (f.travelsWellInCar === 'no') p.travelsWellInCarDetails = f.travelsWellInCarDetails;
    }
  }
  if (isDog && f.chasesLivestock) {
    p.chasesLivestock = f.chasesLivestock;
    if (f.chasesLivestock === 'yes') p.chasesLivestockDetails = f.chasesLivestockDetails;
  }
  return p;
}

function Text({
  id,
  label,
  value,
  onChange,
  required,
  type = 'text',
  multiline,
}: {
  id: string;
  label: string;
  value?: string | number;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <span className="required"> *</span>}
      </label>
      {multiline ? (
        <textarea id={id} value={value ?? ''} required={required} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          id={id}
          type={type}
          value={value ?? ''}
          required={required}
          min={type === 'number' ? 0 : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="choice-row" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            type="button"
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? 'choice active' : 'choice'}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const yn = (b?: boolean) => (b === undefined ? undefined : b ? 'yes' : 'no');

export default function PetEditor({
  pet,
  onSaved,
  onCancel,
}: {
  pet: AnimalRecord;
  onSaved: (pet: AnimalRecord) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<PetFields>({
    ...pet,
    dateOfBirth: toInputDate(pet.dateOfBirth),
    vaccineExpiryDate: toInputDate(pet.vaccineExpiryDate),
    lastSeasonEndDate: toInputDate(pet.lastSeasonEndDate),
    allergies: pet.allergies ?? { status: 'no' },
    medication: pet.medication ?? { onMedication: false },
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isDog = pet.species === 'dog';
  const isCat = pet.species === 'cat';

  const set = <K extends keyof PetFields>(key: K, value: PetFields[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const meds = f.medication.medications ?? [];
  const setMed = (i: number, patch: Partial<MedicationEntry>) =>
    set('medication', { ...f.medication, medications: meds.map((m, j) => (j === i ? { ...m, ...patch } : m)) });

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      onSaved(await updateAnimal(pet._id, toPayload(f, pet.species)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save these details.');
      setSaving(false);
    }
  }

  const section = (title: string, children: ReactNode) => (
    <>
      <h3 className="section-title">{title}</h3>
      {children}
    </>
  );

  return (
    <form onSubmit={save} className="pet-editor">
      <div className="editor-head">
        <h2 className="step-title">Edit {pet.name}</h2>
        <button type="button" className="link" onClick={onCancel}>
          Back to my pets
        </button>
      </div>

      {section(
        'About',
        <div className="grid">
          <Text id="name" label="Name" value={f.name} onChange={(v) => set('name', v)} required />
          <Text
            id="breed"
            label={isDog || isCat ? 'Breed' : 'Type of animal'}
            value={f.breed}
            onChange={(v) => set('breed', v)}
            required
          />
          <Choice
            label="Sex"
            value={f.sex}
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ]}
            onChange={(v) => set('sex', v as PetFields['sex'])}
          />
          <Text id="dob" label="Date of birth" type="date" value={f.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} />
          {!f.dateOfBirth && (
            <Text id="age" label="Age (years)" type="number" value={f.age} onChange={(v) => set('age', Math.max(0, parseInt(v, 10) || 0))} />
          )}
          <Text id="colour" label="Colour / markings" value={f.colourMarkings} onChange={(v) => set('colourMarkings', v)} />
          <Text id="chip" label="Microchip number" value={f.microchipNumber} onChange={(v) => set('microchipNumber', v)} />
        </div>,
      )}

      {section(
        'Health',
        <>
          <div className="grid">
            <Choice label="Vaccinated" value={yn(f.vaccinated)} options={YES_NO} onChange={(v) => set('vaccinated', v === 'yes')} />
            {f.vaccinated && (
              <Text
                id="vaccine"
                label="Vaccine expiry date"
                type="date"
                value={f.vaccineExpiryDate}
                onChange={(v) => set('vaccineExpiryDate', v)}
                required
              />
            )}
          </div>
          <div className="grid">
            <Choice label="Insured" value={yn(f.insured ?? false)} options={YES_NO} onChange={(v) => set('insured', v === 'yes')} />
            {f.insured && <Text id="insurer" label="Insurer" value={f.insurer} onChange={(v) => set('insurer', v)} required />}
          </div>
          <div className="grid">
            <Choice
              label="Spayed / neutered"
              value={f.neuteredStatus}
              options={[
                { value: 'neutered', label: 'Neutered' },
                { value: 'spayed', label: 'Spayed' },
                { value: 'no', label: 'No' },
              ]}
              onChange={(v) => set('neuteredStatus', v as PetFields['neuteredStatus'])}
            />
            {f.neuteredStatus === 'no' && f.sex === 'female' && (
              <Text
                id="season"
                label="End date of last season"
                type="date"
                value={f.lastSeasonEndDate}
                onChange={(v) => set('lastSeasonEndDate', v)}
              />
            )}
          </div>
          <Choice
            label="Allergies / intolerances"
            value={f.allergies.status}
            options={TRI}
            onChange={(v) => set('allergies', { ...f.allergies, status: v as TriState })}
          />
          {f.allergies.status !== 'no' && (
            <Text
              id="allergy"
              label="Allergy details"
              multiline
              value={f.allergies.details}
              onChange={(v) => set('allergies', { ...f.allergies, details: v })}
            />
          )}
          <Choice
            label="On medication"
            value={yn(f.medication.onMedication)}
            options={YES_NO}
            onChange={(v) =>
              set('medication', {
                onMedication: v === 'yes',
                medications: v === 'yes' && !meds.length ? [blankMedication()] : meds,
              })
            }
          />
          {f.medication.onMedication && (
            <div className="med-list">
              {meds.map((m, i) => (
                <div className="med-card" key={i}>
                  <div className="grid">
                    <Text id={`med-name-${i}`} label="Medication" value={m.name} onChange={(v) => setMed(i, { name: v })} required />
                    <Text id={`med-for-${i}`} label="What it treats" value={m.illnessTreating} onChange={(v) => setMed(i, { illnessTreating: v })} />
                    <Text id={`med-dose-${i}`} label="Dosage" value={m.dosage} onChange={(v) => setMed(i, { dosage: v })} />
                    <Text id={`med-freq-${i}`} label="How often" value={m.frequency} onChange={(v) => setMed(i, { frequency: v })} />
                  </div>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={m.vetPrescribed} onChange={(e) => setMed(i, { vetPrescribed: e.target.checked })} />
                    <span>Prescribed by a vet</span>
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={m.administeredByPawfectPets}
                      onChange={(e) => setMed(i, { administeredByPawfectPets: e.target.checked })}
                    />
                    <span>We need to give it while in our care</span>
                  </label>
                  <Text id={`med-info-${i}`} label="Anything else" value={m.additionalInfo} onChange={(v) => setMed(i, { additionalInfo: v })} />
                  {meds.length > 1 && (
                    <button
                      type="button"
                      className="link danger"
                      onClick={() => set('medication', { ...f.medication, medications: meds.filter((_, j) => j !== i) })}
                    >
                      Remove this medication
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => set('medication', { ...f.medication, medications: [...meds, blankMedication()] })}
              >
                Add another medication
              </button>
            </div>
          )}
        </>,
      )}

      {section(
        'Behaviour',
        <>
          <Text
            id="temperament"
            label="Temperament notes"
            multiline
            value={f.temperamentNotes}
            onChange={(v) => set('temperamentNotes', v)}
          />
          <Choice label="Aggression to people" value={yn(f.aggressionToPeople)} options={YES_NO} onChange={(v) => set('aggressionToPeople', v === 'yes')} />
          {f.aggressionToPeople && (
            <Text
              id="agg-people"
              label="Please give details"
              multiline
              required
              value={f.aggressionToPeopleDetails}
              onChange={(v) => set('aggressionToPeopleDetails', v)}
            />
          )}
          {!isCat && (
            <>
              <Choice
                label="Aggression to other animals"
                value={yn(f.aggressionToOtherAnimals)}
                options={YES_NO}
                onChange={(v) => set('aggressionToOtherAnimals', v === 'yes')}
              />
              {f.aggressionToOtherAnimals && (
                <Text
                  id="agg-animals"
                  label="Please give details"
                  multiline
                  required
                  value={f.aggressionToOtherAnimalsDetails}
                  onChange={(v) => set('aggressionToOtherAnimalsDetails', v)}
                />
              )}
              <Choice label="Travels well in the car" value={f.travelsWellInCar} options={TRI} onChange={(v) => set('travelsWellInCar', v as TriState)} />
              {f.travelsWellInCar === 'no' && (
                <Text
                  id="car"
                  label="Please give details"
                  multiline
                  required
                  value={f.travelsWellInCarDetails}
                  onChange={(v) => set('travelsWellInCarDetails', v)}
                />
              )}
            </>
          )}
          {isDog && (
            <>
              <Choice label="Chases livestock" value={f.chasesLivestock} options={TRI} onChange={(v) => set('chasesLivestock', v as TriState)} />
              {f.chasesLivestock === 'yes' && (
                <Text
                  id="livestock"
                  label="Please give details"
                  multiline
                  required
                  value={f.chasesLivestockDetails}
                  onChange={(v) => set('chasesLivestockDetails', v)}
                />
              )}
            </>
          )}
        </>,
      )}

      {error && <div className="error-banner">{error}</div>}
      <div className="actions end">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
