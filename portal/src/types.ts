// Shapes returned by the backend's /portal/* routes (see
// backend/src/portal/portal.service.ts). Only the fields this app reads.

export interface EmergencyContact {
  sameAsClient: boolean;
  firstName?: string;
  surname?: string;
  address1?: string;
  address2?: string;
  town?: string;
  county?: string;
  postcode?: string;
  phoneNumber?: string;
  email?: string;
}

export interface EmergencyVet {
  practiceName?: string;
  address1?: string;
  address2?: string;
  town?: string;
  county?: string;
  postcode?: string;
  telephone?: string;
  email?: string;
}

export interface Profile {
  id: string;
  firstName?: string;
  surname?: string;
  name?: string;
  email: string;
  phoneNumber?: string;
  address1?: string;
  address2?: string;
  town?: string;
  county?: string;
  postcode?: string;
  emergencyContact: EmergencyContact | null;
  emergencyVet: EmergencyVet | null;
}

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    'firstName' | 'surname' | 'phoneNumber' | 'address1' | 'address2' | 'town' | 'county' | 'postcode'
  >
> & {
  emergencyContact?: EmergencyContact;
  emergencyVet?: EmergencyVet;
};

export interface InvoiceRecord {
  _id: string;
  invoiceNumber: string;
  subject?: string;
  total: number;
  amountPaid?: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issueDate: string;
  dueDate: string;
}

export interface QuoteRecord {
  _id: string;
  quoteNumber: string;
  subject?: string;
  total: number;
  status: 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
  issueDate: string;
  validUntil: string;
}

export type TriState = 'yes' | 'no' | 'unsure';

export interface MedicationEntry {
  name: string;
  illnessTreating?: string;
  dosage?: string;
  frequency?: string;
  vetPrescribed: boolean;
  administeredByPawfectPets: boolean;
  additionalInfo?: string;
}

// The customer-editable part of an Animal (backend CreateAnimalDto). Species,
// photos and the signed off-lead consent stay with staff.
export interface PetFields {
  name: string;
  breed: string;
  sex: 'male' | 'female';
  age: number;
  dateOfBirth?: string;
  vaccinated: boolean;
  vaccineExpiryDate?: string;
  colourMarkings?: string;
  microchipNumber?: string;
  insured?: boolean;
  insurer?: string;
  neuteredStatus?: 'neutered' | 'spayed' | 'no';
  lastSeasonEndDate?: string;
  temperamentNotes?: string;
  aggressionToPeople: boolean;
  aggressionToPeopleDetails?: string;
  aggressionToOtherAnimals?: boolean;
  aggressionToOtherAnimalsDetails?: string;
  travelsWellInCar?: TriState;
  travelsWellInCarDetails?: string;
  chasesLivestock?: TriState;
  chasesLivestockDetails?: string;
  allergies: { status: TriState; details?: string };
  medication: { onMedication: boolean; medications?: MedicationEntry[] };
}

export interface AnimalRecord extends PetFields {
  _id: string;
  species: 'dog' | 'cat' | 'other';
}

export interface BookingRecord {
  _id: string;
  date: string;
  animal?: { _id: string; name: string } | null;
  additionalAnimals?: { _id: string; name: string }[];
  product?: { _id: string; name: string } | null;
  visitTime?: 'AM' | 'PM';
  dropOffTime?: string;
  collectionTime?: string;
  placeholder?: boolean;
}
