import type { FieldTarget } from '../types';

// The catalog of real Customer/Animal fields a form field can be "mapped" to
// (Settings > Forms builder's "Map to" dropdown). Kept as a flat, hand-kept
// list -- mirrors backend/src/customers/dto/create-customer.dto.ts and
// backend/src/animals/dto/create-animal.dto.ts field-for-field. `kind` gates
// which form field types are offered a given target (e.g. a toggle can only
// map to a boolean-kind path); `speciesRestriction` flags Animal paths that
// only apply to some species -- purely informational here (the backend
// strips these server-side per submission; see form-submission-mapping.util.ts).
export type MappingKind = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'signature' | 'photos';

export interface MappingTarget {
  target: FieldTarget;
  path: string;
  label: string;
  kind: MappingKind;
  enumValues?: string[];
  speciesRestriction?: 'dog' | 'not-cat';
}

const YES_NO_UNSURE = ['yes', 'no', 'unsure'];

export const CUSTOMER_MAPPING_TARGETS: MappingTarget[] = [
  { target: 'customer', path: 'firstName', label: 'First name', kind: 'string' },
  { target: 'customer', path: 'surname', label: 'Surname', kind: 'string' },
  { target: 'customer', path: 'address1', label: 'Address line 1', kind: 'string' },
  { target: 'customer', path: 'address2', label: 'Address line 2', kind: 'string' },
  { target: 'customer', path: 'town', label: 'Town', kind: 'string' },
  { target: 'customer', path: 'county', label: 'County', kind: 'string' },
  { target: 'customer', path: 'postcode', label: 'Postcode', kind: 'string' },
  { target: 'customer', path: 'phoneNumber', label: 'Phone number', kind: 'string' },
  { target: 'customer', path: 'email', label: 'Email', kind: 'string' },
  { target: 'customer', path: 'emergencyContact.sameAsClient', label: 'Emergency contact: same as client', kind: 'boolean' },
  { target: 'customer', path: 'emergencyContact.firstName', label: 'Emergency contact: first name', kind: 'string' },
  { target: 'customer', path: 'emergencyContact.surname', label: 'Emergency contact: surname', kind: 'string' },
  { target: 'customer', path: 'emergencyContact.address1', label: 'Emergency contact: address line 1', kind: 'string' },
  { target: 'customer', path: 'emergencyContact.address2', label: 'Emergency contact: address line 2', kind: 'string' },
  { target: 'customer', path: 'emergencyContact.town', label: 'Emergency contact: town', kind: 'string' },
  { target: 'customer', path: 'emergencyContact.county', label: 'Emergency contact: county', kind: 'string' },
  { target: 'customer', path: 'emergencyContact.postcode', label: 'Emergency contact: postcode', kind: 'string' },
  { target: 'customer', path: 'emergencyContact.phoneNumber', label: 'Emergency contact: phone number', kind: 'string' },
  { target: 'customer', path: 'emergencyContact.email', label: 'Emergency contact: email', kind: 'string' },
  { target: 'customer', path: 'emergencyVet.practiceName', label: 'Emergency vet: practice name', kind: 'string' },
  { target: 'customer', path: 'emergencyVet.address1', label: 'Emergency vet: address line 1', kind: 'string' },
  { target: 'customer', path: 'emergencyVet.address2', label: 'Emergency vet: address line 2', kind: 'string' },
  { target: 'customer', path: 'emergencyVet.town', label: 'Emergency vet: town', kind: 'string' },
  { target: 'customer', path: 'emergencyVet.county', label: 'Emergency vet: county', kind: 'string' },
  { target: 'customer', path: 'emergencyVet.postcode', label: 'Emergency vet: postcode', kind: 'string' },
  { target: 'customer', path: 'emergencyVet.telephone', label: 'Emergency vet: telephone', kind: 'string' },
  { target: 'customer', path: 'emergencyVet.email', label: 'Emergency vet: email', kind: 'string' },
  { target: 'customer', path: 'emergencyVet.authorisation.signedName', label: 'Vet authorisation: typed name', kind: 'string' },
  { target: 'customer', path: 'emergencyVet.authorisation.signatureImage', label: 'Vet authorisation: signature', kind: 'signature' },
  { target: 'customer', path: 'security.keysProvided', label: 'Security: keys provided', kind: 'boolean' },
  { target: 'customer', path: 'security.alarmInstructions', label: 'Security: alarm instructions', kind: 'string' },
  { target: 'customer', path: 'security.furtherInformation', label: 'Security: further information', kind: 'string' },
  { target: 'customer', path: 'agreement.signedName', label: 'Agreement: typed name', kind: 'string' },
  { target: 'customer', path: 'agreement.signatureImage', label: 'Agreement: signature', kind: 'signature' },
];

export const ANIMAL_MAPPING_TARGETS: MappingTarget[] = [
  { target: 'animal', path: 'species', label: 'Type (species)', kind: 'enum', enumValues: ['dog', 'cat', 'other'] },
  { target: 'animal', path: 'name', label: 'Name', kind: 'string' },
  { target: 'animal', path: 'breed', label: 'Breed / type of animal', kind: 'string' },
  { target: 'animal', path: 'sex', label: 'Sex', kind: 'enum', enumValues: ['male', 'female'] },
  { target: 'animal', path: 'age', label: 'Age', kind: 'number' },
  { target: 'animal', path: 'dateOfBirth', label: 'Date of birth', kind: 'date' },
  { target: 'animal', path: 'vaccinated', label: 'Vaccinated', kind: 'boolean' },
  { target: 'animal', path: 'vaccineExpiryDate', label: 'Vaccine expiry date', kind: 'date' },
  { target: 'animal', path: 'photos', label: 'Photos', kind: 'photos' },
  { target: 'animal', path: 'colourMarkings', label: 'Colour / markings', kind: 'string' },
  { target: 'animal', path: 'microchipNumber', label: 'Microchip number', kind: 'string' },
  { target: 'animal', path: 'temperamentNotes', label: 'Temperament notes', kind: 'string' },
  { target: 'animal', path: 'aggressionToPeople', label: 'Aggression to people', kind: 'boolean' },
  { target: 'animal', path: 'aggressionToPeopleDetails', label: 'Aggression to people: details', kind: 'string' },
  { target: 'animal', path: 'aggressionToOtherAnimals', label: 'Aggression to other animals', kind: 'boolean', speciesRestriction: 'not-cat' },
  { target: 'animal', path: 'aggressionToOtherAnimalsDetails', label: 'Aggression to other animals: details', kind: 'string', speciesRestriction: 'not-cat' },
  { target: 'animal', path: 'travelsWellInCar', label: 'Travels well in car', kind: 'enum', enumValues: YES_NO_UNSURE, speciesRestriction: 'not-cat' },
  { target: 'animal', path: 'chasesLivestock', label: 'Chases livestock', kind: 'enum', enumValues: YES_NO_UNSURE, speciesRestriction: 'dog' },
  { target: 'animal', path: 'chasesLivestockDetails', label: 'Chases livestock: details', kind: 'string', speciesRestriction: 'dog' },
  { target: 'animal', path: 'allergies.status', label: 'Allergies / intolerances', kind: 'enum', enumValues: YES_NO_UNSURE },
  { target: 'animal', path: 'allergies.details', label: 'Allergy details', kind: 'string' },
  { target: 'animal', path: 'medication.onMedication', label: 'On medication', kind: 'boolean' },
  { target: 'animal', path: 'medication.medications[0].name', label: 'Medication: name', kind: 'string' },
  { target: 'animal', path: 'medication.medications[0].illnessTreating', label: 'Medication: illness treating', kind: 'string' },
  { target: 'animal', path: 'medication.medications[0].dosage', label: 'Medication: dosage', kind: 'string' },
  { target: 'animal', path: 'medication.medications[0].frequency', label: 'Medication: frequency', kind: 'string' },
  { target: 'animal', path: 'medication.medications[0].additionalInfo', label: 'Medication: additional info', kind: 'string' },
  { target: 'animal', path: 'medication.medications[0].vetPrescribed', label: 'Medication: vet prescribed', kind: 'boolean' },
  { target: 'animal', path: 'medication.medications[0].administeredByPawfectPets', label: 'Medication: we administer it', kind: 'boolean' },
  { target: 'animal', path: 'offLeadConsent.mode', label: 'On lead / off lead', kind: 'enum', enumValues: ['on_lead', 'off_lead'], speciesRestriction: 'dog' },
  { target: 'animal', path: 'offLeadConsent.signature', label: 'Off-lead consent signature', kind: 'signature', speciesRestriction: 'dog' },
];

// Which field types are allowed to map to which target "kind" -- shown as
// the Map-to dropdown's option set, filtered by the form field's own type.
export function compatibleKinds(fieldType: string): MappingKind[] {
  switch (fieldType) {
    case 'text':
    case 'textarea':
      return ['string'];
    case 'number':
      return ['number'];
    case 'date':
      return ['date'];
    case 'toggle':
      return ['boolean'];
    case 'choice':
      return ['enum', 'string'];
    case 'multichoice':
      return ['string'];
    case 'file':
      return ['photos'];
    case 'signature':
      return ['signature'];
    default:
      return [];
  }
}

export function mappingTargetsFor(target: FieldTarget, fieldType: string): MappingTarget[] {
  const kinds = compatibleKinds(fieldType);
  const pool = target === 'customer' ? CUSTOMER_MAPPING_TARGETS : ANIMAL_MAPPING_TARGETS;
  return pool.filter((t) => kinds.includes(t.kind));
}
