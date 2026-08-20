import { useEffect, useMemo, useState } from 'react';
import { fetchCustomer, submitAnimal, submitCustomer } from '../api/client';
import type { IntakeState, PetDetails } from '../types';
import ProgressBar from './ProgressBar';
import WelcomeStep from './steps/WelcomeStep';
import ClientDetailsStep from './steps/ClientDetailsStep';
import EmergencyContactStep from './steps/EmergencyContactStep';
import EmergencyVetStep from './steps/EmergencyVetStep';
import PetCountStep from './steps/PetCountStep';
import PetDetailsStep from './steps/PetDetailsStep';
import SecurityStep from './steps/SecurityStep';
import AgreementStep from './steps/AgreementStep';
import ThankYouStep from './steps/ThankYouStep';

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
    colourMarkings: '',
    microchipNumber: '',
    hasCollar: null,
    temperamentNotes: '',
    aggressionToPeople: null,
    aggressionToOtherAnimals: null,
    travelsWellInCar: '',
    chasesLivestock: '',
    allergies: { status: 'no', details: '' },
    medication: { onMedication: false, details: '' },
    offLeadConsent: undefined,
  };
}

function initialState(customerId: string | null): IntakeState {
  return {
    customerId,
    client: { name: '', address: '', telephone: '', mobile: '', email: '' },
    emergencyContact: { sameAsClient: false },
    emergencyVet: { practiceName: '', address: '', telephone: '', email: '', alternativeVetAuthorised: false },
    petCount: 1,
    pets: [emptyPet()],
    security: { keysProvided: false, alarmInstructions: '', furtherInformation: '' },
    agreement: { signedName: '' },
  };
}

type LoadState = 'loading' | 'ready' | 'not-found';

export default function IntakeForm({ customerId }: { customerId: string | null }) {
  const [state, setState] = useState<IntakeState>(() => initialState(customerId));
  const [loadState, setLoadState] = useState<LoadState>(customerId ? 'loading' : 'ready');
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    fetchCustomer(customerId)
      .then((customer) => {
        setState((s) => ({
          ...s,
          client: {
            name: customer.name,
            address: customer.address ?? '',
            telephone: customer.telephone ?? '',
            mobile: customer.mobile ?? '',
            email: customer.email,
          },
        }));
        setLoadState('ready');
      })
      .catch(() => setLoadState('not-found'));
  }, [customerId]);

  const petSteps = state.petCount;
  const totalSteps = 7 + petSteps;
  const securityStepIndex = 5 + petSteps;
  const agreementStepIndex = securityStepIndex + 1;

  useEffect(() => {
    setState((s) => {
      const pets = [...s.pets];
      while (pets.length < s.petCount) pets.push(emptyPet());
      while (pets.length > s.petCount) pets.pop();
      return { ...s, pets };
    });
  }, [state.petCount]);

  const stepLabel = useMemo(() => {
    if (step === 0) return 'Welcome';
    if (step === 1) return 'Your details';
    if (step === 2) return 'Emergency contact';
    if (step === 3) return 'Emergency vet';
    if (step === 4) return 'Pets';
    if (step >= 5 && step < securityStepIndex) return `Pet ${step - 4} of ${petSteps}`;
    if (step === securityStepIndex) return 'Security';
    if (step === agreementStepIndex) return 'Agreement';
    return '';
  }, [step, petSteps, securityStepIndex, agreementStepIndex]);

  function validateStep(): string | null {
    if (step === 1) {
      const c = state.client;
      if (!c.name || !c.address || !c.mobile || !c.email) return 'Please fill in all required fields.';
    }
    if (step === 2) {
      const e = state.emergencyContact;
      if (!e.sameAsClient) {
        if (!e.name || !e.address) return 'Emergency contact name and address are required.';
        if (!e.telephone && !e.mobile) return 'Provide at least one emergency contact phone number.';
      }
    }
    if (step === 3) {
      const v = state.emergencyVet;
      if (!v.practiceName || !v.address || !v.telephone) return 'Please fill in all required fields.';
      if (!v.alternativeVetAuthorised) return 'Please acknowledge alternative vet care authorisation.';
    }
    if (step >= 5 && step < securityStepIndex) {
      const pet = state.pets[step - 5];
      if (!pet) return null;
      if (!pet.breed || !pet.name || !pet.sex || !pet.age) return 'Please fill in all required fields.';
      if (pet.vaccinated === null) return 'Please let us know if this pet is vaccinated.';
      if (pet.vaccinated && !pet.vaccineExpiryDate) return 'Vaccine expiry date is required.';
      if (pet.hasCollar === null) return 'Please let us know if this pet has a collar.';
      if (pet.aggressionToPeople === null || pet.aggressionToOtherAnimals === null)
        return 'Please answer the aggression questions.';
      if (pet.aggressionToPeople && !pet.aggressionToPeopleDetails)
        return 'Please provide details about aggression to people.';
      if (pet.aggressionToOtherAnimals && !pet.aggressionToOtherAnimalsDetails)
        return 'Please provide details about aggression to other animals.';
      if (!pet.travelsWellInCar || !pet.chasesLivestock) return 'Please answer all required questions.';
      if (pet.medication.onMedication && !pet.medication.details)
        return 'Please provide medication details.';
      if (pet.species === 'dog') {
        if (!pet.offLeadConsent?.mode) return 'Please choose on lead or off lead.';
      }
    }
    if (step === agreementStepIndex) {
      if (!state.agreement.signedName) return 'Please type your name to sign.';
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

    if (step === agreementStepIndex) {
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
      const customer = await submitCustomer(state);
      for (const pet of state.pets) {
        await submitAnimal(customer._id, pet);
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
          This registration link doesn't match a record we have. Please contact PawfectPets
          Sherborne for a new link, or continue below to register from scratch.
        </p>
        <button className="btn btn-primary" onClick={() => setLoadState('ready')}>
          Start fresh registration
        </button>
      </div>
    );
  }

  if (submitted) {
    return <ThankYouStep name={state.client.name} />;
  }

  return (
    <>
      <ProgressBar current={step + 1} total={totalSteps} label={stepLabel} />
      <div className="card">
        {error && <div className="error-banner">{error}</div>}

        {step === 0 && <WelcomeStep name={state.client.name} isLead={!!customerId} />}
        {step === 1 && (
          <ClientDetailsStep value={state.client} onChange={(client) => setState((s) => ({ ...s, client }))} />
        )}
        {step === 2 && (
          <EmergencyContactStep
            value={state.emergencyContact}
            onChange={(emergencyContact) => setState((s) => ({ ...s, emergencyContact }))}
          />
        )}
        {step === 3 && (
          <EmergencyVetStep
            value={state.emergencyVet}
            onChange={(emergencyVet) => setState((s) => ({ ...s, emergencyVet }))}
          />
        )}
        {step === 4 && (
          <PetCountStep
            value={state.petCount}
            onChange={(petCount) => setState((s) => ({ ...s, petCount }))}
          />
        )}
        {step >= 5 && step < securityStepIndex && state.pets[step - 5] && (
          <PetDetailsStep
            index={step - 5}
            total={petSteps}
            value={state.pets[step - 5]}
            onChange={(pet) =>
              setState((s) => {
                const pets = [...s.pets];
                pets[step - 5] = pet;
                return { ...s, pets };
              })
            }
          />
        )}
        {step === securityStepIndex && (
          <SecurityStep
            value={state.security}
            onChange={(security) => setState((s) => ({ ...s, security }))}
          />
        )}
        {step === agreementStepIndex && (
          <AgreementStep
            value={state.agreement}
            onChange={(agreement) => setState((s) => ({ ...s, agreement }))}
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
            {submitting
              ? 'Submitting…'
              : step === agreementStepIndex
                ? 'Submit'
                : step === 0
                  ? "Let's go"
                  : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
