import type { AnimalRecord, CustomerRecord, IntakeState, PetDetails } from '../types';

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

export function fetchAnimalsForCustomer(customerId: string): Promise<AnimalRecord[]> {
  return request(`/animals/for-customer/${customerId}`);
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
    emergencyContact: {
      ...state.emergencyContact,
      email: state.emergencyContact.email || undefined,
    },
    emergencyVet: {
      ...state.emergencyVet,
      email: state.emergencyVet.email || undefined,
    },
    security: state.security,
    agreement: state.agreement,
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
    vaccinated: pet.vaccinated,
    vaccineExpiryDate: pet.vaccinated ? pet.vaccineExpiryDate : undefined,
    photo: pet.photo,
    colourMarkings: pet.colourMarkings || undefined,
    microchipNumber: pet.microchipNumber || undefined,
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
