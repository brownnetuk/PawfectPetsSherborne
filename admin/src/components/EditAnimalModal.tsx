import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { Animal, Sex, Species, TriState } from '../types';

interface Props {
  animal: Animal;
  onClose: () => void;
  onSaved: () => void;
}

const TRI_STATE_OPTIONS: TriState[] = ['yes', 'no', 'unsure'];

export default function EditAnimalModal({ animal, onClose, onSaved }: Props) {
  const [species, setSpecies] = useState<Species>(animal.species);
  const [breed, setBreed] = useState(animal.breed);
  const [name, setName] = useState(animal.name);
  const [sex, setSex] = useState<Sex>(animal.sex);
  const [age, setAge] = useState(String(animal.age));
  const [vaccinated, setVaccinated] = useState(animal.vaccinated);
  const [vaccineExpiryDate, setVaccineExpiryDate] = useState(
    animal.vaccineExpiryDate ? animal.vaccineExpiryDate.slice(0, 10) : '',
  );
  const [colourMarkings, setColourMarkings] = useState(animal.colourMarkings ?? '');
  const [microchipNumber, setMicrochipNumber] = useState(animal.microchipNumber ?? '');
  const [temperamentNotes, setTemperamentNotes] = useState(animal.temperamentNotes ?? '');
  const [aggressionToPeople, setAggressionToPeople] = useState(animal.aggressionToPeople);
  const [aggressionToPeopleDetails, setAggressionToPeopleDetails] = useState(
    animal.aggressionToPeopleDetails ?? '',
  );
  const [aggressionToOtherAnimals, setAggressionToOtherAnimals] = useState(
    animal.aggressionToOtherAnimals ?? false,
  );
  const [aggressionToOtherAnimalsDetails, setAggressionToOtherAnimalsDetails] = useState(
    animal.aggressionToOtherAnimalsDetails ?? '',
  );
  const [travelsWellInCar, setTravelsWellInCar] = useState<TriState>(animal.travelsWellInCar ?? 'unsure');
  const [chasesLivestock, setChasesLivestock] = useState<TriState>(animal.chasesLivestock ?? 'unsure');
  const [chasesLivestockDetails, setChasesLivestockDetails] = useState(animal.chasesLivestockDetails ?? '');
  const [allergyStatus, setAllergyStatus] = useState<TriState>(animal.allergies.status);
  const [allergyDetails, setAllergyDetails] = useState(animal.allergies.details ?? '');
  const [onMedication, setOnMedication] = useState(animal.medication.onMedication);
  const [medicationDetails, setMedicationDetails] = useState(animal.medication.details ?? '');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (vaccinated && !vaccineExpiryDate) {
      setError('Vaccine expiry date is required for a vaccinated pet.');
      return;
    }
    if (onMedication && !medicationDetails) {
      setError('Medication details are required.');
      return;
    }
    if (aggressionToPeople && !aggressionToPeopleDetails) {
      setError('Please give details about aggression to people.');
      return;
    }
    if (aggressionToOtherAnimals && !aggressionToOtherAnimalsDetails) {
      setError('Please give details about aggression to other animals.');
      return;
    }
    if (species === 'dog' && chasesLivestock === 'yes' && !chasesLivestockDetails) {
      setError('Please give details about chasing livestock.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.updateAnimal(animal._id, {
        species,
        breed,
        name,
        sex,
        age: Number(age),
        vaccinated,
        vaccineExpiryDate: vaccinated ? vaccineExpiryDate : undefined,
        colourMarkings: colourMarkings || undefined,
        microchipNumber: microchipNumber || undefined,
        temperamentNotes: temperamentNotes || undefined,
        aggressionToPeople,
        aggressionToPeopleDetails: aggressionToPeople ? aggressionToPeopleDetails : undefined,
        aggressionToOtherAnimals: species !== 'cat' ? aggressionToOtherAnimals : undefined,
        aggressionToOtherAnimalsDetails:
          species !== 'cat' && aggressionToOtherAnimals ? aggressionToOtherAnimalsDetails : undefined,
        travelsWellInCar: species !== 'cat' ? travelsWellInCar : undefined,
        chasesLivestock: species === 'dog' ? chasesLivestock : undefined,
        chasesLivestockDetails:
          species === 'dog' && chasesLivestock === 'yes' ? chasesLivestockDetails : undefined,
        allergies: { status: allergyStatus, details: allergyDetails || undefined },
        medication: { onMedication, details: medicationDetails || undefined },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Edit ${animal.name}`} onClose={onClose} wide>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Species</label>
            <select value={species} onChange={(e) => setSpecies(e.target.value as Species)}>
              <option value="dog">Dog</option>
              <option value="cat">Cat</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{species === 'other' ? 'Type of animal' : 'Breed'}</label>
            <input type="text" value={breed} onChange={(e) => setBreed(e.target.value)} required />
          </div>
          <div className="field">
            <label>Sex</label>
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Age</label>
            <input type="number" min="0" value={age} onChange={(e) => setAge(e.target.value)} required />
          </div>
          <div className="field">
            <label>Microchip number</label>
            <input type="text" value={microchipNumber} onChange={(e) => setMicrochipNumber(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Colour / markings</label>
          <input type="text" value={colourMarkings} onChange={(e) => setColourMarkings(e.target.value)} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 400 }}>
          <input type="checkbox" checked={vaccinated} onChange={(e) => setVaccinated(e.target.checked)} />
          Vaccinated
        </label>
        {vaccinated && (
          <div className="field">
            <label>Vaccine expiry date</label>
            <input
              type="date"
              value={vaccineExpiryDate}
              onChange={(e) => setVaccineExpiryDate(e.target.value)}
              required
            />
          </div>
        )}
        <div className="field">
          <label>Temperament notes</label>
          <textarea value={temperamentNotes} onChange={(e) => setTemperamentNotes(e.target.value)} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={aggressionToPeople}
            onChange={(e) => setAggressionToPeople(e.target.checked)}
          />
          Aggression to people
        </label>
        {aggressionToPeople && (
          <div className="field">
            <label>Aggression to people — details</label>
            <input
              type="text"
              value={aggressionToPeopleDetails}
              onChange={(e) => setAggressionToPeopleDetails(e.target.value)}
              required
            />
          </div>
        )}

        {species !== 'cat' && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={aggressionToOtherAnimals}
                onChange={(e) => setAggressionToOtherAnimals(e.target.checked)}
              />
              Aggression to animals
            </label>
            {aggressionToOtherAnimals && (
              <div className="field">
                <label>Aggression to other animals — details</label>
                <input
                  type="text"
                  value={aggressionToOtherAnimalsDetails}
                  onChange={(e) => setAggressionToOtherAnimalsDetails(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="field">
              <label>Travels well in car</label>
              <select value={travelsWellInCar} onChange={(e) => setTravelsWellInCar(e.target.value as TriState)}>
                {TRI_STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {species === 'dog' && (
          <div className="field" style={{ marginTop: 14 }}>
            <label>Chases livestock</label>
            <select value={chasesLivestock} onChange={(e) => setChasesLivestock(e.target.value as TriState)}>
              {TRI_STATE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {chasesLivestock === 'yes' && (
              <input
                type="text"
                placeholder="Details"
                value={chasesLivestockDetails}
                onChange={(e) => setChasesLivestockDetails(e.target.value)}
                style={{ marginTop: 8 }}
                required
              />
            )}
          </div>
        )}

        <div className="field">
          <label>Allergies / intolerances</label>
          <select value={allergyStatus} onChange={(e) => setAllergyStatus(e.target.value as TriState)}>
            {TRI_STATE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {allergyStatus !== 'no' && (
          <div className="field">
            <label>Allergy details</label>
            <input type="text" value={allergyDetails} onChange={(e) => setAllergyDetails(e.target.value)} />
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 400 }}>
          <input type="checkbox" checked={onMedication} onChange={(e) => setOnMedication(e.target.checked)} />
          On medication
        </label>
        {onMedication && (
          <div className="field">
            <label>Medication details</label>
            <input type="text" value={medicationDetails} onChange={(e) => setMedicationDetails(e.target.value)} required />
          </div>
        )}

        {species === 'dog' && (
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Off-lead consent is captured via the customer's signature on the intake form and isn't
            editable here.
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
