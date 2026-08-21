import Modal from './Modal';
import type { Animal } from '../types';

interface Props {
  animal: Animal;
  onClose: () => void;
}

export default function ViewAnimalModal({ animal, onClose }: Props) {
  const isCat = animal.species === 'cat';
  const isDog = animal.species === 'dog';

  return (
    <Modal title={animal.name} onClose={onClose} wide>
      <div className="section-title">Details</div>
      <dl className="kv-grid">
        <dt>Species</dt>
        <dd style={{ textTransform: 'capitalize' }}>{animal.species}</dd>
        <dt>{isDog || isCat ? 'Breed' : 'Type of animal'}</dt>
        <dd>{animal.breed}</dd>
        <dt>Sex</dt>
        <dd style={{ textTransform: 'capitalize' }}>{animal.sex}</dd>
        <dt>Age</dt>
        <dd>{animal.age}</dd>
        <dt>Vaccinated</dt>
        <dd>
          {animal.vaccinated
            ? `Yes${animal.vaccineExpiryDate ? ` (expires ${new Date(animal.vaccineExpiryDate).toLocaleDateString('en-GB')})` : ''}`
            : 'No'}
        </dd>
        <dt>Colour / markings</dt>
        <dd>{animal.colourMarkings || '—'}</dd>
        <dt>Microchip number</dt>
        <dd>{animal.microchipNumber || '—'}</dd>
        <dt>Temperament notes</dt>
        <dd>{animal.temperamentNotes || '—'}</dd>
      </dl>

      <div className="section-title">Behaviour</div>
      <dl className="kv-grid">
        <dt>Aggression to people</dt>
        <dd>
          {animal.aggressionToPeople
            ? `Yes — ${animal.aggressionToPeopleDetails || '—'}`
            : 'No'}
        </dd>
        {!isCat && (
          <>
            <dt>Aggression to other animals</dt>
            <dd>
              {animal.aggressionToOtherAnimals
                ? `Yes — ${animal.aggressionToOtherAnimalsDetails || '—'}`
                : 'No'}
            </dd>
            <dt>Travels well in car</dt>
            <dd style={{ textTransform: 'capitalize' }}>{animal.travelsWellInCar || '—'}</dd>
          </>
        )}
        {isDog && (
          <>
            <dt>Chases livestock</dt>
            <dd style={{ textTransform: 'capitalize' }}>
              {animal.chasesLivestock === 'yes'
                ? `Yes — ${animal.chasesLivestockDetails || '—'}`
                : animal.chasesLivestock || '—'}
            </dd>
          </>
        )}
        <dt>Allergies</dt>
        <dd style={{ textTransform: animal.allergies.status === 'no' ? 'none' : 'capitalize' }}>
          {animal.allergies.status === 'no'
            ? 'No'
            : `${animal.allergies.status} — ${animal.allergies.details || '—'}`}
        </dd>
        <dt>On medication</dt>
        <dd>{animal.medication.onMedication ? `Yes — ${animal.medication.details || '—'}` : 'No'}</dd>
      </dl>

      {isDog && animal.offLeadConsent && (
        <>
          <div className="section-title">Off-lead consent</div>
          <dl className="kv-grid">
            <dt>Lead</dt>
            <dd>{animal.offLeadConsent.mode === 'off_lead' ? 'Off lead' : 'On lead'}</dd>
          </dl>
          {animal.offLeadConsent.signature && (
            <img
              src={animal.offLeadConsent.signature}
              alt="Off-lead consent signature"
              style={{ maxWidth: 220, marginTop: 10, border: '1px solid var(--border)', borderRadius: 6 }}
            />
          )}
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
