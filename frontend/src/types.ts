export type Species = 'dog' | 'cat' | 'other';
export type Sex = 'male' | 'female';
export type TriState = 'yes' | 'no' | 'unsure';
export type LeadMode = 'on_lead' | 'off_lead';
export type NeuteredStatus = 'neutered' | 'spayed' | 'no';

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
  neuteredStatus?: NeuteredStatus;
  lastSeasonEndDate?: string;
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

export interface MedicationEntry {
  name: string;
  illnessTreating?: string;
  dosage?: string;
  frequency?: string;
  vetPrescribed: boolean;
  administeredByPawfectPets: boolean;
  additionalInfo?: string;
}

export interface MedicationInfo {
  onMedication: boolean;
  medications?: MedicationEntry[];
  // Legacy, read-only -- superseded by `medications` above, kept only so a
  // pet recorded before this change still shows what was typed.
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
  // A plain boolean, not tri-state like the aggression fields below -- it's
  // shown as a toggle switch, which always renders definitively on or off,
  // so there's no meaningful "unanswered" state to represent or validate.
  vaccinated: boolean;
  vaccineExpiryDate?: string;
  photos?: string[];
  colourMarkings?: string;
  microchipNumber?: string;
  neuteredStatus?: NeuteredStatus | '';
  lastSeasonEndDate?: string;
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

// --- Forms (public form-fill page, src/forms/) ---

export interface FieldMapping {
  target: 'customer' | 'animal';
  path: string;
}

export interface FormFieldBase {
  id: string;
  label: string;
  required: boolean;
  mapping?: FieldMapping;
}

export type SimpleFormField = FormFieldBase & {
  type: 'text' | 'textarea' | 'number' | 'date' | 'toggle' | 'signature';
};

export type FileFormField = FormFieldBase & {
  type: 'file';
  maxFiles?: number;
};

export type ChoiceFormField = FormFieldBase & {
  type: 'choice' | 'multichoice';
  options: string[];
};

export type GroupFormField = FormFieldBase & {
  type: 'group';
  repeatable: true;
  minRepeats: number;
  maxRepeats?: number;
  fields: FormField[];
};

export type FormField = SimpleFormField | FileFormField | ChoiceFormField | GroupFormField;

export interface FormSubmissionPublic {
  _id: string;
  formName: string;
  fields: FormField[];
  status: 'pending' | 'completed';
  recipientName?: string;
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
