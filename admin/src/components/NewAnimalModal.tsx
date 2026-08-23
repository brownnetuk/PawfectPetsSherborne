import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { LeadMode, Sex, Species, TriState } from '../types';

interface Props {
  customerId: string;
  onClose: () => void;
  onCreated: () => void;
}

const TRI_STATE_OPTIONS: TriState[] = ['yes', 'no', 'unsure'];
const MAX_PET_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_PET_PHOTOS = 2;

export default function NewAnimalModal({ customerId, onClose, onCreated }: Props) {
  const [species, setSpecies] = useState<Species>('dog');
  const [breed, setBreed] = useState('');
  const [name, setName] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [age, setAge] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [vaccinated, setVaccinated] = useState(false);
  const [vaccineExpiryDate, setVaccineExpiryDate] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [colourMarkings, setColourMarkings] = useState('');
  const [microchipNumber, setMicrochipNumber] = useState('');
  const [temperamentNotes, setTemperamentNotes] = useState('');
  const [aggressionToPeople, setAggressionToPeople] = useState(false);
  const [aggressionToPeopleDetails, setAggressionToPeopleDetails] = useState('');
  const [aggressionToOtherAnimals, setAggressionToOtherAnimals] = useState(false);
  const [aggressionToOtherAnimalsDetails, setAggressionToOtherAnimalsDetails] = useState('');
  const [travelsWellInCar, setTravelsWellInCar] = useState<TriState>('unsure');
  const [chasesLivestock, setChasesLivestock] = useState<TriState>('unsure');
  const [chasesLivestockDetails, setChasesLivestockDetails] = useState('');
  const [allergyStatus, setAllergyStatus] = useState<TriState>('no');
  const [allergyDetails, setAllergyDetails] = useState('');
  const [onMedication, setOnMedication] = useState(false);
  const [medicationDetails, setMedicationDetails] = useState('');
  const [leadMode, setLeadMode] = useState<LeadMode>('on_lead');
  const [consentSignature, setConsentSignature] = useState('');

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
    if (species === 'dog' && leadMode === 'off_lead' && !consentSignature) {
      setError('A signature is required to record off-lead consent.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createAnimal({
        customer: customerId,
        species,
        breed,
        name,
        sex,
        age: Number(age),
        dateOfBirth: dateOfBirth || undefined,
        vaccinated,
        vaccineExpiryDate: vaccinated ? vaccineExpiryDate : undefined,
        photos: photos.length ? photos : undefined,
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
        offLeadConsent:
          species === 'dog'
            ? { mode: leadMode, signature: leadMode === 'off_lead' ? consentSignature : undefined }
            : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pet');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New pet" onClose={onClose} wide>
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
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
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
            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Microchip number</label>
            <input type="text" value={microchipNumber} onChange={(e) => setMicrochipNumber(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Colour / markings</label>
          <input type="text" value={colourMarkings} onChange={(e) => setColourMarkings(e.target.value)} />
        </div>
        <div className="field">
          <label>Photos</label>
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
              {photos.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img
                    src={p}
                    alt="Pet"
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
                  />
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
          <>
            <div className="field">
              <label>Off-lead consent</label>
              <select value={leadMode} onChange={(e) => setLeadMode(e.target.value as LeadMode)}>
                <option value="on_lead">On lead only</option>
                <option value="off_lead">Off lead permitted</option>
              </select>
            </div>
            {leadMode === 'off_lead' && (
              <div className="field">
                <label>Customer's signature (as given verbally/in writing)</label>
                <input
                  type="text"
                  value={consentSignature}
                  onChange={(e) => setConsentSignature(e.target.value)}
                  required
                />
                <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
                  Normally captured on the intake form — only record this here if the customer has
                  separately confirmed off-lead consent for this pet with you directly.
                </div>
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create pet'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
