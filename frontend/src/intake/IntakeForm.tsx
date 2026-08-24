import { useEffect, useMemo, useState } from 'react';
import {
  fetchAnimalsForCustomer,
  fetchCustomer,
  fetchDeclarationText,
  fetchOffLeadConsentText,
  fetchTerms,
  fetchVetAuthorisationText,
  logCompletionSnapshot,
  submitAnimal,
  submitCustomer,
  updateAnimal,
} from '../api/client';
import Modal from '../components/Modal';
import { buildCustomerFormPdf } from '../pdf/customerFormPdf';
import type { AnimalRecord, IntakeState, PetDetails } from '../types';
import ProgressBar from './ProgressBar';
import WelcomeStep from './steps/WelcomeStep';
import ClientDetailsStep from './steps/ClientDetailsStep';
import EmergencyContactStep from './steps/EmergencyContactStep';
import EmergencyVetStep from './steps/EmergencyVetStep';
import PetCountStep from './steps/PetCountStep';
import PetDetailsStep from './steps/PetDetailsStep';
import SecurityStep from './steps/SecurityStep';
import FurtherInfoStep from './steps/FurtherInfoStep';
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
    dateOfBirth: '',
    vaccinated: false,
    vaccineExpiryDate: '',
    photos: [],
    colourMarkings: '',
    microchipNumber: '',
    neuteredStatus: '',
    lastSeasonEndDate: '',
    temperamentNotes: '',
    aggressionToPeople: null,
    aggressionToOtherAnimals: null,
    travelsWellInCar: '',
    chasesLivestock: '',
    chasesLivestockDetails: '',
    allergies: { status: 'no', details: '' },
    medication: { onMedication: false, medications: [] },
    offLeadConsent: undefined,
  };
}

function petFromRecord(a: AnimalRecord): PetDetails {
  return {
    key: a._id,
    _id: a._id,
    species: a.species,
    breed: a.breed,
    name: a.name,
    sex: a.sex,
    age: String(a.age),
    dateOfBirth: a.dateOfBirth ? a.dateOfBirth.slice(0, 10) : '',
    vaccinated: a.vaccinated,
    vaccineExpiryDate: a.vaccineExpiryDate ? a.vaccineExpiryDate.slice(0, 10) : '',
    photos: a.photos ?? [],
    colourMarkings: a.colourMarkings ?? '',
    microchipNumber: a.microchipNumber ?? '',
    neuteredStatus: a.neuteredStatus ?? '',
    lastSeasonEndDate: a.lastSeasonEndDate ? a.lastSeasonEndDate.slice(0, 10) : '',
    temperamentNotes: a.temperamentNotes ?? '',
    aggressionToPeople: a.aggressionToPeople,
    aggressionToPeopleDetails: a.aggressionToPeopleDetails ?? '',
    aggressionToOtherAnimals: a.aggressionToOtherAnimals ?? null,
    aggressionToOtherAnimalsDetails: a.aggressionToOtherAnimalsDetails ?? '',
    travelsWellInCar: a.travelsWellInCar ?? '',
    chasesLivestock: a.chasesLivestock ?? '',
    chasesLivestockDetails: a.chasesLivestockDetails ?? '',
    allergies: { status: a.allergies.status, details: a.allergies.details ?? '' },
    medication: { onMedication: a.medication.onMedication, medications: a.medication.medications ?? [] },
    // Only mode/signature -- the stored record also carries acknowledgedAt/date
    // (set server-side when consent was first given), which the update DTO
    // rejects as unexpected properties if resubmitted verbatim.
    offLeadConsent: a.offLeadConsent
      ? { mode: a.offLeadConsent.mode, signature: a.offLeadConsent.signature }
      : undefined,
  };
}

function initialState(customerId: string | null): IntakeState {
  return {
    customerId,
    client: { firstName: '', address1: '', town: '', postcode: '', phoneNumber: '', email: '' },
    emergencyContact: { sameAsClient: false },
    emergencyVet: { practiceName: '', address1: '', town: '', postcode: '', telephone: '', email: '' },
    // Once existing pets load, this becomes "how many *additional* pets" rather
    // than a total -- see existingCount below.
    petCount: 1,
    pets: [emptyPet()],
    security: { keysProvided: false, alarmInstructions: '', furtherInformation: '' },
    agreement: { signedName: '', termsAccepted: false },
  };
}

type LoadState = 'loading' | 'ready' | 'not-found';

export default function IntakeForm({ customerId }: { customerId: string | null }) {
  const [state, setState] = useState<IntakeState>(() => initialState(customerId));
  const [loadState, setLoadState] = useState<LoadState>(customerId ? 'loading' : 'ready');
  // How many of state.pets (from the front) are existing animals being
  // reviewed/edited, vs. new ones appended after the "any more pets" step.
  const [existingCount, setExistingCount] = useState(0);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showTermsWarning, setShowTermsWarning] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    Promise.all([fetchCustomer(customerId), fetchAnimalsForCustomer(customerId)])
      .then(([customer, animals]) => {
        setState((s) => ({
          ...s,
          client: {
            firstName: customer.firstName ?? '',
            surname: customer.surname ?? '',
            address1: customer.address1 ?? '',
            address2: customer.address2 ?? '',
            town: customer.town ?? '',
            county: customer.county ?? '',
            postcode: customer.postcode ?? '',
            phoneNumber: customer.phoneNumber ?? '',
            email: customer.email,
          },
          emergencyContact: customer.emergencyContact
            ? { ...customer.emergencyContact }
            : s.emergencyContact,
          emergencyVet: customer.emergencyVet ? { ...customer.emergencyVet } : s.emergencyVet,
          security: customer.security
            ? {
                keysProvided: customer.security.keysProvided,
                // Never prefilled: the backend only exposes the encrypted
                // ciphertext to authorised staff, not this public endpoint.
                // Left blank, the backend's PATCH leaves the existing value
                // untouched, so there's no need to round-trip it here.
                alarmInstructions: '',
                furtherInformation: customer.security.furtherInformation ?? '',
              }
            : s.security,
          petCount: animals.length > 0 ? 0 : 1,
          pets: animals.length > 0 ? animals.map(petFromRecord) : s.pets,
        }));
        setExistingCount(animals.length);
        setLoadState('ready');
      })
      .catch(() => setLoadState('not-found'));
  }, [customerId]);

  // step 4..(countStepIndex-1): existing pets, reviewed/edited in place.
  // countStepIndex: "any more pets to add?" (or the original "how many pets?"
  // when there are no existing ones to review first).
  // (countStepIndex+1)..securityStepIndex-1: new pets, one step per additional pet.
  const countStepIndex = 4 + existingCount;
  const additionalCount = state.petCount;
  const securityStepIndex = countStepIndex + additionalCount + 1;
  const furtherInfoStepIndex = securityStepIndex + 1;
  const agreementStepIndex = furtherInfoStepIndex + 1;
  const totalSteps = agreementStepIndex + 1;

  function petIndexForStep(s: number): number | null {
    if (s >= 4 && s < countStepIndex) return s - 4;
    if (s > countStepIndex && s < securityStepIndex) return existingCount + (s - countStepIndex - 1);
    return null;
  }

  // Grows/shrinks only the *new*-pet tail of state.pets -- the existing-pet
  // prefix (set once when animals load, above) is never touched here.
  useEffect(() => {
    setState((s) => {
      const targetLength = existingCount + additionalCount;
      const pets = [...s.pets];
      while (pets.length < targetLength) pets.push(emptyPet());
      while (pets.length > targetLength) pets.pop();
      return { ...s, pets };
    });
  }, [additionalCount, existingCount]);

  const stepLabel = useMemo(() => {
    if (step === 0) return 'Welcome';
    if (step === 1) return 'Your details';
    if (step === 2) return 'Emergency contact';
    if (step === 3) return 'Emergency vet';
    if (step === countStepIndex) return existingCount > 0 ? 'Any more pets?' : 'Pets';
    const petIndex = petIndexForStep(step);
    if (petIndex !== null) {
      const total = existingCount + additionalCount;
      return `Pet ${petIndex + 1} of ${total}`;
    }
    if (step === securityStepIndex) return 'Security';
    if (step === furtherInfoStepIndex) return 'Additional information';
    if (step === agreementStepIndex) return 'Agreement';
    return '';
  }, [step, countStepIndex, existingCount, additionalCount, securityStepIndex, furtherInfoStepIndex, agreementStepIndex]);

  function validateStep(): string | null {
    if (step === 1) {
      const c = state.client;
      if (!c.firstName || !c.address1 || !c.town || !c.postcode || !c.phoneNumber || !c.email)
        return 'Please fill in all required fields.';
    }
    if (step === 2) {
      const e = state.emergencyContact;
      if (!e.sameAsClient) {
        if (!e.firstName || !e.address1 || !e.town || !e.postcode)
          return 'Emergency contact name and address are required.';
        if (!e.phoneNumber) return 'Emergency contact phone number is required.';
      }
    }
    if (step === 3) {
      const v = state.emergencyVet;
      if (!v.practiceName || !v.address1 || !v.town || !v.postcode || !v.telephone)
        return 'Please fill in all required fields.';
      if (!v.authorisation?.signedName) return 'Please sign to authorise alternative vet care.';
      if (!v.authorisation?.signatureImage) return 'Please draw your signature to authorise alternative vet care.';
    }
    const petIndex = petIndexForStep(step);
    if (petIndex !== null) {
      const pet = state.pets[petIndex];
      if (!pet) return null;
      if (!pet.breed || !pet.name || !pet.sex || !pet.age) return 'Please fill in all required fields.';
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
      if (pet.medication.onMedication && !pet.medication.medications?.length)
        return 'Please add at least one medication.';
      if (pet.medication.medications?.some((m) => !m.name))
        return 'Please provide a name for each medication.';
      if (pet.species === 'dog') {
        if (!pet.offLeadConsent?.mode) return 'Please choose on lead or off lead.';
      }
    }
    if (step === agreementStepIndex) {
      if (!state.agreement.signedName) return 'Please type your name to sign.';
      if (!state.agreement.signatureImage) return 'Please draw your signature to sign.';
    }
    return null;
  }

  async function handleNext() {
    if (step === agreementStepIndex && !state.agreement.termsAccepted) {
      setShowTermsWarning(true);
      return;
    }
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

  // Best-effort: a snapshot failing here is a nice-to-have on top of a
  // submission that already succeeded, so it never surfaces an error back to
  // the customer or blocks the thank-you screen.
  async function snapshotSubmittedForm(customerId: string) {
    try {
      const [terms, vetText, offLeadText, declarationText] = await Promise.all([
        fetchTerms().catch(() => ({ html: '' })),
        fetchVetAuthorisationText().catch(() => ({ text: '' })),
        fetchOffLeadConsentText().catch(() => ({ text: '' })),
        fetchDeclarationText().catch(() => ({ text: '' })),
      ]);
      const doc = await buildCustomerFormPdf(state, terms.html, vetText.text, offLeadText.text, declarationText.text);
      const attachmentData = doc.output('datauristring');
      const fullName = [state.client.firstName, state.client.surname].filter(Boolean).join(' ') || 'customer';
      const attachmentName = `${fullName}-registration-form.pdf`.replace(/[^a-z0-9.-]+/gi, '-');
      await logCompletionSnapshot(customerId, 'Registration form submitted', attachmentData, attachmentName);
    } catch {
      // See comment above -- never let this affect the submission itself.
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const customer = await submitCustomer(state);
      for (const pet of state.pets) {
        if (pet._id) {
          await updateAnimal(pet._id, customer._id, pet);
        } else {
          await submitAnimal(customer._id, pet);
        }
      }
      setSubmitted(true);
      snapshotSubmittedForm(customer._id);
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
    return <ThankYouStep name={state.client.firstName} />;
  }

  const petIndex = petIndexForStep(step);

  return (
    <>
      <ProgressBar current={step + 1} total={totalSteps} label={stepLabel} />
      <div className="card">
        {error && <div className="error-banner">{error}</div>}

        {step === 0 && (
          <WelcomeStep name={state.client.firstName} isLead={!!customerId} existingPetCount={existingCount} />
        )}
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
        {step === countStepIndex && (
          <PetCountStep
            value={state.petCount}
            onChange={(petCount) => setState((s) => ({ ...s, petCount }))}
            allowZero={existingCount > 0}
            title={existingCount > 0 ? 'Any other pets to add?' : undefined}
            subtitle={
              existingCount > 0
                ? "Let us know how many more you'd like to register — choose None if that's everything."
                : undefined
            }
          />
        )}
        {petIndex !== null && state.pets[petIndex] && (
          <PetDetailsStep
            index={petIndex}
            total={existingCount + additionalCount}
            value={state.pets[petIndex]}
            onChange={(pet) =>
              setState((s) => {
                const pets = [...s.pets];
                pets[petIndex] = pet;
                return { ...s, pets };
              })
            }
          />
        )}
        {step === securityStepIndex && (
          <SecurityStep
            value={state.security}
            onChange={(security) => setState((s) => ({ ...s, security }))}
            resuming={!!customerId}
          />
        )}
        {step === furtherInfoStepIndex && (
          <FurtherInfoStep
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

      {showTermsWarning && (
        <Modal title="Please read the terms and conditions" onClose={() => setShowTermsWarning(false)}>
          <p>You have not read the terms and conditions, please scroll to the bottom.</p>
        </Modal>
      )}
    </>
  );
}
