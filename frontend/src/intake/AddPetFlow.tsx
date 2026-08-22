import { useEffect, useMemo, useState } from 'react';
import { fetchCustomer, submitAnimal } from '../api/client';
import type { CustomerRecord, PetDetails } from '../types';
import ProgressBar from './ProgressBar';
import PetCountStep from './steps/PetCountStep';
import PetDetailsStep from './steps/PetDetailsStep';

function emptyPet(): PetDetails {
  return {
    key: crypto.randomUUID(),
    species: 'dog',
    breed: '',
    name: '',
    sex: '',
    age: '',
    vaccinated: null,
    vaccineExpiryDate: '',
    photos: [],
    colourMarkings: '',
    microchipNumber: '',
    temperamentNotes: '',
    aggressionToPeople: null,
    aggressionToOtherAnimals: null,
    travelsWellInCar: '',
    chasesLivestock: '',
    chasesLivestockDetails: '',
    allergies: { status: 'no', details: '' },
    medication: { onMedication: false, details: '' },
    offLeadConsent: undefined,
  };
}

type LoadState = 'loading' | 'ready' | 'not-found';

// A trimmed-down companion to IntakeForm for an existing, already-registered
// customer adding another pet. Deliberately never touches customer/emergency/
// security/agreement data (unlike the full intake flow's submit, which resends
// all of it) -- it only ever calls submitAnimal, so there's no risk of an
// empty re-submitted field silently blanking out something already on file.
export default function AddPetFlow({ customerId }: { customerId: string }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [petCount, setPetCount] = useState(1);
  const [pets, setPets] = useState<PetDetails[]>([emptyPet()]);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetchCustomer(customerId)
      .then((c) => {
        setCustomer(c);
        setLoadState('ready');
      })
      .catch(() => setLoadState('not-found'));
  }, [customerId]);

  useEffect(() => {
    setPets((prev) => {
      const next = [...prev];
      while (next.length < petCount) next.push(emptyPet());
      while (next.length > petCount) next.pop();
      return next;
    });
  }, [petCount]);

  const totalSteps = 1 + petCount;

  const stepLabel = useMemo(() => {
    if (step === 0) return 'How many pets';
    return `Pet ${step} of ${petCount}`;
  }, [step, petCount]);

  function validateStep(): string | null {
    if (step >= 1) {
      const pet = pets[step - 1];
      if (!pet) return null;
      if (!pet.breed || !pet.name || !pet.sex || !pet.age) return 'Please fill in all required fields.';
      if (pet.vaccinated === null) return 'Please let us know if this pet is vaccinated.';
      if (pet.vaccinated && !pet.vaccineExpiryDate) return 'Vaccine expiry date is required.';
      if (pet.aggressionToPeople === null) return 'Please answer the aggression questions.';
      if (pet.aggressionToPeople && !pet.aggressionToPeopleDetails)
        return 'Please provide details about aggression to people.';
      if (pet.species !== 'cat') {
        if (pet.aggressionToOtherAnimals === null) return 'Please answer the aggression questions.';
        if (pet.aggressionToOtherAnimals && !pet.aggressionToOtherAnimalsDetails)
          return 'Please provide details about aggression to other animals.';
        if (!pet.travelsWellInCar) return 'Please answer all required questions.';
      }
      if (pet.species === 'dog') {
        if (!pet.chasesLivestock) return 'Please answer all required questions.';
        if (pet.chasesLivestock === 'yes' && !pet.chasesLivestockDetails)
          return 'Please provide details about chasing livestock.';
      }
      if (pet.medication.onMedication && !pet.medication.details)
        return 'Please provide medication details.';
      if (pet.species === 'dog' && !pet.offLeadConsent?.mode) return 'Please choose on lead or off lead.';
    }
    return null;
  }

  async function handleNext() {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    if (step === petCount) {
      await handleSubmit();
      return;
    }
    setStep((s) => s + 1);
  }

  function handleBack() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      for (const pet of pets) {
        await submitAnimal(customerId, pet);
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadState === 'loading') {
    return <div className="center-message">Loading your details…</div>;
  }

  if (loadState === 'not-found') {
    return (
      <div className="center-message">
        <h2>Link not found</h2>
        <p className="subtitle">
          This link doesn't match a record we have. Please contact PawfectPets Sherborne for a
          new link.
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="center-message">
        <h1>Thanks{customer ? `, ${customer.name}` : ''}!</h1>
        <p className="subtitle">
          {petCount === 1 ? "Your new pet's" : "Your new pets'"} details have been added. We'll be
          in touch to confirm any bookings.
        </p>
      </div>
    );
  }

  return (
    <>
      <ProgressBar current={step + 1} total={totalSteps} label={stepLabel} />
      <div className="card">
        {error && <div className="error-banner">{error}</div>}

        {step === 0 && (
          <PetCountStep
            value={petCount}
            onChange={setPetCount}
            title={`Add a pet${customer ? ` for ${customer.name}` : ''}`}
            subtitle="How many pets are you adding today?"
          />
        )}
        {step >= 1 && pets[step - 1] && (
          <PetDetailsStep
            index={step - 1}
            total={petCount}
            value={pets[step - 1]}
            onChange={(pet) =>
              setPets((prev) => {
                const next = [...prev];
                next[step - 1] = pet;
                return next;
              })
            }
          />
        )}

        <div className="actions">
          {step > 0 ? (
            <button className="btn btn-secondary" onClick={handleBack} disabled={submitting}>
              Back
            </button>
          ) : (
            <span />
          )}
          <button className="btn btn-primary" onClick={handleNext} disabled={submitting}>
            {submitting ? 'Submitting…' : step === petCount ? 'Submit' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
