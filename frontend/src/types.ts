export type Species = 'dog' | 'cat' | 'other';
export type Sex = 'male' | 'female';
export type TriState = 'yes' | 'no' | 'unsure';
export type LeadMode = 'on_lead' | 'off_lead';

export interface CustomerRecord {
  _id: string;
  name: string;
  email: string;
  firstName?: string;
  surname?: string;
  address?: string;
  address1?: string;
  address2?: string;
  town?: string;
  county?: string;
  postcode?: string;
  phoneNumber?: string;
  status: 'pending' | 'active' | 'inactive' | 'update_info';
  emergencyContact?: EmergencyContactData;
  emergencyVet?: EmergencyVetData;
  security?: SecurityData;
}

export interface AnimalRecord {
  _id: string;
  species: Species;
  breed: string;
  name: string;
  sex: Sex;
  age: number;
  dateOfBirth?: string;
  vaccinated: boolean;
  vaccineExpiryDate?: string;
  photos?: string[];
  colourMarkings?: string;
  microchipNumber?: string;
  temperamentNotes?: string;
  aggressionToPeople: boolean;
  aggressionToPeopleDetails?: string;
  aggressionToOtherAnimals?: boolean;
  aggressionToOtherAnimalsDetails?: string;
  travelsWellInCar?: TriState;
  chasesLivestock?: TriState;
  chasesLivestockDetails?: string;
  allergies: AllergyInfo;
  medication: MedicationInfo;
  offLeadConsent?: OffLeadConsentData;
}

export interface EmergencyContactData {
  sameAsClient: boolean;
  firstName?: string;
  surname?: string;
  name?: string;
  address1?: string;
  address2?: string;
  town?: string;
  county?: string;
  postcode?: string;
  address?: string;
  phoneNumber?: string;
  email?: string;
}

export interface EmergencyVetAuthorisationData {
  signedName: string;
  signatureImage?: string;
}

export interface EmergencyVetData {
  practiceName: string;
  address1: string;
  address2?: string;
  town: string;
  county?: string;
  postcode: string;
  address?: string;
  telephone: string;
  email?: string;
  authorisation?: EmergencyVetAuthorisationData;
}

export interface SecurityData {
  keysProvided: boolean;
  alarmInstructions?: string;
  furtherInformation?: string;
}

export interface AgreementData {
  signedName: string;
  signatureImage?: string;
}

export interface ClientDetails {
  firstName: string;
  surname?: string;
  address1: string;
  address2?: string;
  town: string;
  county?: string;
  postcode: string;
  phoneNumber: string;
  email: string;
}

export interface AllergyInfo {
  status: TriState;
  details?: string;
}

export interface MedicationInfo {
  onMedication: boolean;
  details?: string;
}

export interface OffLeadConsentData {
  mode: LeadMode;
  signature?: string;
}

export interface PetDetails {
  key: string; // client-side only, for React list keys
  _id?: string; // set when this is an existing animal being reviewed/edited, not a new one
  species: Species;
  breed: string;
  name: string;
  sex: Sex | '';
  age: string;
  dateOfBirth?: string;
  vaccinated: boolean | null;
  vaccineExpiryDate?: string;
  photos?: string[];
  colourMarkings?: string;
  microchipNumber?: string;
  temperamentNotes?: string;
  aggressionToPeople: boolean | null;
  aggressionToPeopleDetails?: string;
  aggressionToOtherAnimals: boolean | null;
  aggressionToOtherAnimalsDetails?: string;
  travelsWellInCar: TriState | '';
  chasesLivestock: TriState | '';
  chasesLivestockDetails?: string;
  allergies: AllergyInfo;
  medication: MedicationInfo;
  offLeadConsent?: OffLeadConsentData;
}

export interface IntakeState {
  customerId: string | null;
  client: ClientDetails;
  emergencyContact: EmergencyContactData;
  emergencyVet: EmergencyVetData;
  petCount: number;
  pets: PetDetails[];
  security: SecurityData;
  agreement: AgreementData;
}
