import { ChoiceGroup, SelectField, TextField, ToggleField } from '../fields';
import SignaturePad from '../SignaturePad';
import type { PetDetails, Species } from '../../types';

interface Props {
  index: number;
  total: number;
  value: PetDetails;
  onChange: (value: PetDetails) => void;
}

const SPECIES_OPTIONS: { value: Species; label: string }[] = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'other', label: 'Other' },
];

const TRI_STATE_OPTIONS = [
  { value: 'yes' as const, label: 'Yes' },
  { value: 'no' as const, label: 'No' },
  { value: 'unsure' as const, label: 'Unsure' },
];

const YES_NO_OPTIONS = [
  { value: 'yes' as const, label: 'Yes' },
  { value: 'no' as const, label: 'No' },
];

export default function PetDetailsStep({ index, total, value, onChange }: Props) {
  const set = <K extends keyof PetDetails>(key: K, v: PetDetails[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div>
      <span className="pet-tag">
        Pet {index + 1} of {total}
      </span>
      <h2>{value.name || 'Pet'} details</h2>

      <ChoiceGroup
        label="Type"
        value={value.species}
        options={SPECIES_OPTIONS}
        onChange={(v) => set('species', v)}
        required
      />
      <TextField label="Breed" value={value.breed} onChange={(v) => set('breed', v)} required />
      <TextField label="Name" value={value.name} onChange={(v) => set('name', v)} required />
      <div className="grid-2">
        <SelectField
          label="Sex"
          value={value.sex}
          options={[
            { value: 'male' as const, label: 'Male' },
            { value: 'female' as const, label: 'Female' },
          ]}
          onChange={(v) => set('sex', v)}
          required
        />
        <TextField
          label="Age"
          type="number"
          value={value.age}
          onChange={(v) => set('age', v)}
          required
        />
      </div>

      <ToggleField
        label="Vaccinated"
        value={!!value.vaccinated}
        onChange={(v) => set('vaccinated', v)}
      />
      {value.vaccinated && (
        <TextField
          label="Vaccine expiry date"
          type="date"
          value={value.vaccineExpiryDate ?? ''}
          onChange={(v) => set('vaccineExpiryDate', v)}
          required
        />
      )}

      <TextField
        label="Colour / markings"
        value={value.colourMarkings ?? ''}
        onChange={(v) => set('colourMarkings', v)}
      />
      <TextField
        label="Microchip number"
        value={value.microchipNumber ?? ''}
        onChange={(v) => set('microchipNumber', v)}
      />
      <ToggleField label="Has collar" value={!!value.hasCollar} onChange={(v) => set('hasCollar', v)} />

      <TextField
        label="Temperament notes"
        value={value.temperamentNotes ?? ''}
        onChange={(v) => set('temperamentNotes', v)}
        multiline
      />

      <ChoiceGroup
        label="Aggression to people"
        value={value.aggressionToPeople === null ? '' : value.aggressionToPeople ? 'yes' : 'no'}
        options={YES_NO_OPTIONS}
        onChange={(v) => set('aggressionToPeople', v === 'yes')}
        required
      />
      {value.aggressionToPeople && (
        <TextField
          label="Please give details"
          value={value.aggressionToPeopleDetails ?? ''}
          onChange={(v) => set('aggressionToPeopleDetails', v)}
          required
        />
      )}
      <ChoiceGroup
        label="Aggression to other animals"
        value={
          value.aggressionToOtherAnimals === null ? '' : value.aggressionToOtherAnimals ? 'yes' : 'no'
        }
        options={YES_NO_OPTIONS}
        onChange={(v) => set('aggressionToOtherAnimals', v === 'yes')}
        required
      />
      {value.aggressionToOtherAnimals && (
        <TextField
          label="Please give details"
          value={value.aggressionToOtherAnimalsDetails ?? ''}
          onChange={(v) => set('aggressionToOtherAnimalsDetails', v)}
          required
        />
      )}
      <ChoiceGroup
        label="Travels well in car"
        value={value.travelsWellInCar}
        options={TRI_STATE_OPTIONS}
        onChange={(v) => set('travelsWellInCar', v)}
        required
      />
      <ChoiceGroup
        label="Chases livestock"
        value={value.chasesLivestock}
        options={TRI_STATE_OPTIONS}
        onChange={(v) => set('chasesLivestock', v)}
        required
      />

      <ChoiceGroup
        label="Allergies / intolerances"
        value={value.allergies.status}
        options={TRI_STATE_OPTIONS}
        onChange={(v) => set('allergies', { ...value.allergies, status: v })}
        required
      />
      {value.allergies.status !== 'no' && (
        <TextField
          label="Allergy details"
          value={value.allergies.details ?? ''}
          onChange={(v) => set('allergies', { ...value.allergies, details: v })}
        />
      )}

      <ChoiceGroup
        label="On medication"
        value={value.medication.onMedication ? 'yes' : 'no'}
        options={YES_NO_OPTIONS}
        onChange={(v) =>
          set('medication', { ...value.medication, onMedication: v === 'yes' })
        }
        required
      />
      {value.medication.onMedication && (
        <TextField
          label="Medication details"
          value={value.medication.details ?? ''}
          onChange={(v) => set('medication', { ...value.medication, details: v })}
          required
        />
      )}

      {value.species === 'dog' && (
        <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1.15rem' }}>Off-lead consent</h2>
          <p className="subtitle">
            Let us know whether {value.name || 'your dog'} can be exercised off the lead.
          </p>
          <ChoiceGroup
            label="Lead"
            value={value.offLeadConsent?.mode ?? ''}
            options={[
              { value: 'on_lead' as const, label: 'On lead' },
              { value: 'off_lead' as const, label: 'Off lead' },
            ]}
            onChange={(v) =>
              set('offLeadConsent', { ...(value.offLeadConsent ?? {}), mode: v })
            }
            required
          />
          {value.offLeadConsent?.mode === 'off_lead' && (
            <>
              <p className="field-hint" style={{ marginBottom: 10 }}>
                I consent to {value.name || 'my dog'} being exercised off the lead, and understand
                this is at my own risk.
              </p>
              <SignaturePad
                value={value.offLeadConsent?.signature}
                onChange={(sig) =>
                  set('offLeadConsent', { ...(value.offLeadConsent ?? { mode: 'off_lead' }), signature: sig })
                }
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
