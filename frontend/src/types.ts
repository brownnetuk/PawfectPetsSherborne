export type Species = 'dog' | 'cat' | 'other';
export type Sex = 'male' | 'female';
export type TriState = 'yes' | 'no' | 'unsure';
export type LeadMode = 'on_lead' | 'off_lead';

export interface CustomerRecord {
  _id: string;
  name: string;
  email: string;
  address?: string;
  telephone?: string;
  mobile?: string;
  status: 'pending' | 'active' | 'inactive' | 'update_info';
  emergencyContact?: EmergencyContactData;
  emergencyVet?: EmergencyVetData;
  security?: SecurityData;
}

export interface AnimalSummary {
  _id: string;
  name: string;
  species: Species;
  breed: string;
}

export interface EmergencyContactData {
  sameAsClient: boolean;
  name?: string;
  address?: string;
  telephone?: string;
  mobile?: string;
  email?: string;
}

export interface EmergencyVetData {
  practiceName: string;
  address: string;
  telephone: string;
  email?: string;
  alternativeVetAuthorised: boolean;
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
  name: string;
  address: string;
  telephone?: string;
  mobile: string;
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
  species: Species;
  breed: string;
  name: string;
  sex: Sex | '';
  age: string;
  vaccinated: boolean | null;
  vaccineExpiryDate?: string;
  colourMarkings?: string;
  microchipNumber?: string;
  hasCollar: boolean | null;
  temperamentNotes?: string;
  aggressionToPeople: boolean | null;
  aggressionToPeopleDetails?: string;
  aggressionToOtherAnimals: boolean | null;
  aggressionToOtherAnimalsDetails?: string;
  travelsWellInCar: TriState | '';
  chasesLivestock: TriState | '';
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
