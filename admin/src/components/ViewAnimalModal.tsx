import { useState } from 'react';
import Modal from './Modal';
import type { Animal } from '../types';

interface Props {
  animal: Animal;
  onClose: () => void;
}

export default function ViewAnimalModal({ animal, onClose }: Props) {
  const isCat = animal.species === 'cat';
  const isDog = animal.species === 'dog';
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);

  return (
    <>
      <Modal title={animal.name} onClose={onClose} wide className="modal-olive">
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
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
                <dt>Date of birth</dt>
                <dd>{animal.dateOfBirth ? new Date(animal.dateOfBirth).toLocaleDateString('en-GB') : '—'}</dd>
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
                <dt>Spayed/Neutered</dt>
                <dd>
                  {animal.neuteredStatus === 'neutered' && 'Neutered (Boy)'}
                  {animal.neuteredStatus === 'spayed' &&
                    `Spayed (Girl)${
                      animal.lastSeasonEndDate
                        ? ` — last season ended ${new Date(animal.lastSeasonEndDate).toLocaleDateString('en-GB')}`
                        : ''
                    }`}
                  {(!animal.neuteredStatus || animal.neuteredStatus === 'no') && 'No'}
                </dd>
                <dt>Temperament notes</dt>
                <dd>{animal.temperamentNotes || '—'}</dd>
              </dl>
            </div>
            {animal.photos && animal.photos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
                {animal.photos.map((p, i) => (
                  <img
                    key={i}
                    src={p}
                    alt={animal.name}
                    onClick={() => setZoomedPhoto(p)}
                    style={{
                      width: 200,
                      height: animal.photos!.length > 1 ? 140 : 200,
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      cursor: 'zoom-in',
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
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
            <dd>
              {!animal.medication.onMedication ? (
                'No'
              ) : animal.medication.medications && animal.medication.medications.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {animal.medication.medications.map((m, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>
                      <strong>{m.name}</strong>
                      {m.illnessTreating && ` — for ${m.illnessTreating}`}
                      {m.dosage && `, ${m.dosage}`}
                      {m.frequency && `, ${m.frequency}`}
                      <br />
                      Vet prescribed: {m.vetPrescribed ? 'Yes' : 'No'}; Pawfect Pets to administer:{' '}
                      {m.administeredByPawfectPets ? 'Yes' : 'No'}
                      {m.additionalInfo && (
                        <>
                          <br />
                          {m.additionalInfo}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                `Yes — ${animal.medication.details || '—'}`
              )}
            </dd>
          </dl>
        </div>

        {isDog && animal.offLeadConsent && (
          <div className="card" style={{ marginBottom: 16 }}>
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
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </Modal>

      {zoomedPhoto && (
        <div
          onClick={() => setZoomedPhoto(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            cursor: 'zoom-out',
            padding: 40,
          }}
        >
          <img
            src={zoomedPhoto}
            alt={animal.name}
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)' }}
          />
        </div>
      )}
    </>
  );
}
