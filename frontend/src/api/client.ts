import type { AnimalRecord, CustomerRecord, FormSubmissionPublic, IntakeState, PetDetails } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    throw new Error(message || `Request failed (${res.status})`);
  }
  // Gate on actual body content rather than status code: NestJS's default DELETE
  // handlers return 200 with an empty body, not 204.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function fetchCustomer(id: string): Promise<CustomerRecord> {
  return request(`/customers/${id}`);
}

export function fetchTerms(): Promise<{ html: string }> {
  return request('/settings/terms');
}

export function fetchVetAuthorisationText(): Promise<{ text: string }> {
  return request('/settings/vet-authorisation');
}

export function fetchOffLeadConsentText(): Promise<{ text: string }> {
  return request('/settings/off-lead-consent');
}

export function fetchDeclarationText(): Promise<{ text: string }> {
  return request('/settings/declaration');
}

export function fetchAnimalsForCustomer(customerId: string): Promise<AnimalRecord[]> {
  return request(`/animals/for-customer/${customerId}`);
}

export function logCompletionSnapshot(
  customerId: string,
  title: string,
  attachmentData: string,
  attachmentName: string,
): Promise<void> {
  return request(`/customers/${customerId}/completion-snapshot`, {
    method: 'POST',
    body: JSON.stringify({ title, attachmentData, attachmentName }),
  });
}

export function submitCustomer(
  state: IntakeState,
): Promise<CustomerRecord> {
  // class-validator's @IsOptional() only skips validation for null/undefined, not '' —
  // format-validated optional fields (email) must be omitted entirely when blank.
  const payload = {
    firstName: state.client.firstName,
    surname: state.client.surname || undefined,
    address1: state.client.address1,
    address2: state.client.address2 || undefined,
    town: state.client.town,
    county: state.client.county || undefined,
    postcode: state.client.postcode,
    phoneNumber: state.client.phoneNumber,
    email: state.client.email,
    // Only the fields CreateCustomerDto/UpdateCustomerDto actually accept --
    // when this is a returning customer (state.emergencyContact/emergencyVet
    // pre-filled wholesale from GET /customers/:id, see IntakeForm.tsx), the
    // fetched objects also carry server-computed fields the DTOs don't
    // whitelist (emergencyContact.name/address, emergencyVet.address/
    // alternativeVetAuthorised, emergencyVet.authorisation.signedAt) -- the
    // backend recomputes all of those itself, but with the global
    // ValidationPipe's forbidNonWhitelisted, spreading them back in a PATCH
    // would 400 instead of silently being ignored.
    emergencyContact: {
      // Always false -- the intake wizard no longer offers a "same as
      // client" shortcut, so the fields below are always genuinely typed
      // in by the customer, even for a returning customer resuming from a
      // record that used the old shortcut (EmergencyContactStep always
      // shows and requires these fields now regardless of this flag).
      sameAsClient: false,
      firstName: state.emergencyContact.firstName || undefined,
      surname: state.emergencyContact.surname || undefined,
      address1: state.emergencyContact.address1 || undefined,
      address2: state.emergencyContact.address2 || undefined,
      town: state.emergencyContact.town || undefined,
      county: state.emergencyContact.county || undefined,
      postcode: state.emergencyContact.postcode || undefined,
      phoneNumber: state.emergencyContact.phoneNumber || undefined,
      email: state.emergencyContact.email || undefined,
    },
    emergencyVet: {
      practiceName: state.emergencyVet.practiceName,
      address1: state.emergencyVet.address1,
      address2: state.emergencyVet.address2 || undefined,
      town: state.emergencyVet.town,
      county: state.emergencyVet.county || undefined,
      postcode: state.emergencyVet.postcode,
      telephone: state.emergencyVet.telephone,
      email: state.emergencyVet.email || undefined,
      authorisation: state.emergencyVet.authorisation
        ? {
            signedName: state.emergencyVet.authorisation.signedName,
            signatureImage: state.emergencyVet.authorisation.signatureImage,
          }
        : undefined,
    },
    security: state.security,
    // termsAccepted is a client-side-only submit gate (see AgreementStep) --
    // the backend's agreement sub-document only ever stores signedName/
    // signatureImage, and rejects unknown properties.
    agreement: { signedName: state.agreement.signedName, signatureImage: state.agreement.signatureImage },
  };

  return state.customerId
    ? request(`/customers/${state.customerId}`, { method: 'PATCH', body: JSON.stringify(payload) })
    : request('/customers', { method: 'POST', body: JSON.stringify(payload) });
}

function animalPayload(pet: PetDetails) {
  return {
    species: pet.species,
    breed: pet.breed,
    name: pet.name,
    sex: pet.sex,
    age: Number(pet.age),
    dateOfBirth: pet.dateOfBirth || undefined,
    vaccinated: pet.vaccinated,
    vaccineExpiryDate: pet.vaccinated ? pet.vaccineExpiryDate : undefined,
    // Sent as-is, including empty -- for updateAnimal() specifically, omitting
    // it when empty would mean "leave the stored photos alone", which would
    // silently un-delete a photo the customer just removed while reviewing.
    photos: pet.photos ?? [],
    colourMarkings: pet.colourMarkings || undefined,
    microchipNumber: pet.microchipNumber || undefined,
    neuteredStatus: pet.neuteredStatus || undefined,
    lastSeasonEndDate:
      pet.neuteredStatus === 'no' && pet.sex === 'female' ? pet.lastSeasonEndDate || undefined : undefined,
    temperamentNotes: pet.temperamentNotes || undefined,
    aggressionToPeople: pet.aggressionToPeople,
    aggressionToPeopleDetails: pet.aggressionToPeople ? pet.aggressionToPeopleDetails : undefined,
    aggressionToOtherAnimals: pet.species !== 'cat' ? pet.aggressionToOtherAnimals : undefined,
    aggressionToOtherAnimalsDetails:
      pet.species !== 'cat' && pet.aggressionToOtherAnimals
        ? pet.aggressionToOtherAnimalsDetails
        : undefined,
    travelsWellInCar: pet.species !== 'cat' ? pet.travelsWellInCar || undefined : undefined,
    chasesLivestock: pet.species === 'dog' ? pet.chasesLivestock || undefined : undefined,
    chasesLivestockDetails:
      pet.species === 'dog' && pet.chasesLivestock === 'yes' ? pet.chasesLivestockDetails : undefined,
    allergies: pet.allergies,
    medication: pet.medication,
    offLeadConsent: pet.species === 'dog' ? pet.offLeadConsent : undefined,
  };
}

export function submitAnimal(customerId: string, pet: PetDetails) {
  return request('/animals', {
    method: 'POST',
    body: JSON.stringify({ customer: customerId, ...animalPayload(pet) }),
  });
}

export function updateAnimal(id: string, customerId: string, pet: PetDetails) {
  return request(`/animals/${id}/for-customer/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(animalPayload(pet)),
  });
}

export function fetchFormSubmission(id: string): Promise<FormSubmissionPublic> {
  return request(`/form-submissions/${id}/public`);
}

export function submitFormSubmission(id: string, answers: Record<string, unknown>) {
  return request(`/form-submissions/${id}/submit`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}
