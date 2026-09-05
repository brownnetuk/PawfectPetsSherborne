import { useState } from 'react';
import * as api from '../api/client';
import { DateReadout } from './DateTimeReadout';
import MedicationEntriesField from './MedicationEntriesField';
import Modal from './Modal';
import type { Animal, MedicationEntry, NeuteredStatus, Sex, Species, TriState } from '../types';

interface Props {
  animal: Animal;
  onClose: () => void;
  onSaved: () => void;
}

const TRI_STATE_OPTIONS: TriState[] = ['yes', 'no', 'unsure'];
const MAX_PET_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_PET_PHOTOS = 2;

export default function EditAnimalModal({ animal, onClose, onSaved }: Props) {
  const [species, setSpecies] = useState<Species>(animal.species);
  const [breed, setBreed] = useState(animal.breed);
  const [name, setName] = useState(animal.name);
  const [sex, setSex] = useState<Sex>(animal.sex);
  const [age, setAge] = useState(String(animal.age));
  const [dateOfBirth, setDateOfBirth] = useState(
    animal.dateOfBirth ? animal.dateOfBirth.slice(0, 10) : '',
  );
  const [vaccinated, setVaccinated] = useState(animal.vaccinated);
  const [vaccineExpiryDate, setVaccineExpiryDate] = useState(
    animal.vaccineExpiryDate ? animal.vaccineExpiryDate.slice(0, 10) : '',
  );
  const [vaccineRecordPhoto, setVaccineRecordPhoto] = useState(animal.vaccineRecordPhoto ?? '');
  const [vaccineRecordPhotoError, setVaccineRecordPhotoError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>(animal.photos ?? []);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [colourMarkings, setColourMarkings] = useState(animal.colourMarkings ?? '');
  const [microchipNumber, setMicrochipNumber] = useState(animal.microchipNumber ?? '');
  const [insured, setInsured] = useState(animal.insured ?? false);
  const [insurer, setInsurer] = useState(animal.insurer ?? '');
  const [neuteredStatus, setNeuteredStatus] = useState<NeuteredStatus>(animal.neuteredStatus ?? 'no');
  const [lastSeasonEndDate, setLastSeasonEndDate] = useState(
    animal.lastSeasonEndDate ? animal.lastSeasonEndDate.slice(0, 10) : '',
  );
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
  const [medications, setMedications] = useState<MedicationEntry[]>(animal.medication.medications ?? []);
  // Read-only: only present for a pre-existing animal that had the old
  // free-text field filled in before it was replaced by the list above.
  const legacyMedicationDetails =
    !animal.medication.medications?.length ? animal.medication.details : undefined;

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    if (file.size > MAX_PET_PHOTO_BYTES) {
      setPhotoError('That photo is too large — please use one under 4MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotos((prev) => [...prev, reader.result as string]);
    reader.onerror = () => setPhotoError('Failed to read that file.');
    reader.readAsDataURL(file);
  }

  function handleVaccineRecordPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setVaccineRecordPhotoError(null);
    if (file.size > MAX_PET_PHOTO_BYTES) {
      setVaccineRecordPhotoError('That photo is too large — please use one under 4MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setVaccineRecordPhoto(reader.result as string);
    reader.onerror = () => setVaccineRecordPhotoError('Failed to read that file.');
    reader.readAsDataURL(file);
  }

  // The main photo is always whichever one is first in the array -- no separate
  // field for it, so "making" one main is just moving it to the front.
  function makeMainPhoto(index: number) {
    setPhotos((prev) => {
      if (index === 0) return prev;
      const next = [...prev];
      const [chosen] = next.splice(index, 1);
      next.unshift(chosen);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (vaccinated && !vaccineExpiryDate) {
      setError('Vaccine expiry date is required for a vaccinated pet.');
      return;
    }
    if (onMedication && medications.length === 0) {
      setError('Add at least one medication.');
      return;
    }
    if (insured && !insurer) {
      setError('Please give the insurer for an insured pet.');
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
        dateOfBirth: dateOfBirth || undefined,
        vaccinated,
        vaccineExpiryDate: vaccinated ? vaccineExpiryDate : undefined,
        // Sent as-is (including empty), same reasoning as photos below --
        // omitting it when blank would silently un-delete a photo just removed.
        vaccineRecordPhoto,
        // Sent as-is, including empty -- unlike the plain-string fields below,
        // omitting it when empty would mean "leave the stored photos alone",
        // which would silently un-delete a photo the user just removed.
        photos,
        colourMarkings: colourMarkings || undefined,
        microchipNumber: microchipNumber || undefined,
        insured,
        insurer: insured ? insurer : undefined,
        neuteredStatus,
        lastSeasonEndDate:
          neuteredStatus === 'no' && sex === 'female' ? lastSeasonEndDate || undefined : undefined,
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
        medication: { onMedication, medications: onMedication ? medications : undefined },
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
            <label>Date of birth</label>
            <input type="date" lang="en-GB" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            <DateReadout value={dateOfBirth} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Microchip number</label>
            <input type="text" value={microchipNumber} onChange={(e) => setMicrochipNumber(e.target.value)} />
          </div>
          <div className="field">
            <label>Is your pet Spayed/Neutered?</label>
            <select
              value={neuteredStatus}
              onChange={(e) => setNeuteredStatus(e.target.value as NeuteredStatus)}
            >
              <option value="neutered">Neutered (Boy)</option>
              <option value="spayed">Spayed (Girl)</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Is your pet insured?</label>
            <select value={insured ? 'yes' : 'no'} onChange={(e) => setInsured(e.target.value === 'yes')}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
          {insured && (
            <div className="field">
              <label>Insurer</label>
              <input type="text" value={insurer} onChange={(e) => setInsurer(e.target.value)} required />
            </div>
          )}
        </div>
        {neuteredStatus === 'no' && sex === 'female' && (
          <div className="field">
            <label>End date of last season?</label>
            <input
              type="date"
              lang="en-GB"
              value={lastSeasonEndDate}
              onChange={(e) => setLastSeasonEndDate(e.target.value)}
            />
            <DateReadout value={lastSeasonEndDate} />
          </div>
        )}
        <div className="field">
          <label>Colour / markings</label>
          <input type="text" value={colourMarkings} onChange={(e) => setColourMarkings(e.target.value)} />
        </div>
        <div className="field">
          <label>Photos</label>
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
              {photos.map((p, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <img
                    src={p}
                    alt="Pet"
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: '0.8rem' }}>
                    <input
                      type="checkbox"
                      checked={i === 0}
                      disabled={i === 0}
                      onChange={() => makeMainPhoto(i)}
                    />
                    Main pic
                  </label>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < MAX_PET_PHOTOS ? (
            <input type="file" accept="image/*" onChange={handlePhotoChange} />
          ) : (
            <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
              You've added the maximum of {MAX_PET_PHOTOS} photos.
            </div>
          )}
          {photoError && (
            <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: 4 }}>
              {photoError}
            </div>
          )}
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
              lang="en-GB"
              value={vaccineExpiryDate}
              onChange={(e) => setVaccineExpiryDate(e.target.value)}
              required
            />
            <DateReadout value={vaccineExpiryDate} />
          </div>
        )}
        {vaccinated && (
          <div className="field">
            <label>Vaccination record</label>
            {vaccineRecordPhoto ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, alignItems: 'flex-start' }}>
                <img
                  src={vaccineRecordPhoto}
                  alt="Vaccination record"
                  style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                />
                <button type="button" className="btn-link" onClick={() => setVaccineRecordPhoto('')}>
                  Remove
                </button>
              </div>
            ) : (
              <input type="file" accept="image/*" onChange={handleVaccineRecordPhotoChange} />
            )}
            {vaccineRecordPhotoError && (
              <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: 4 }}>
                {vaccineRecordPhotoError}
              </div>
            )}
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
        {onMedication && legacyMedicationDetails && (
          <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: -8, marginBottom: 10 }}>
            Previously recorded (read-only): {legacyMedicationDetails}
          </div>
        )}
        {onMedication && <MedicationEntriesField medications={medications} onChange={setMedications} />}

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
