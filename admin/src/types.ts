export type CustomerStatus = 'pending' | 'active' | 'inactive' | 'update_info';
export type Species = 'dog' | 'cat' | 'other';
export type Sex = 'male' | 'female';
export type TriState = 'yes' | 'no' | 'unsure';
export type LeadMode = 'on_lead' | 'off_lead';
export type ServiceType = 'boarding' | 'daycare' | 'grooming' | 'walking';
export type BookingStatus = 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type ActivityType = 'note' | 'call' | 'email' | 'task' | 'status_change';

export interface Staff {
  id: string;
  name: string;
  email: string;
}

export interface Customer {
  _id: string;
  name: string;
  email: string;
  address?: string;
  telephone?: string;
  mobile?: string;
  status: CustomerStatus;
  createdAt: string;
  emergencyContact?: {
    sameAsClient: boolean;
    name?: string;
    address?: string;
    telephone?: string;
    mobile?: string;
    email?: string;
  };
  emergencyVet?: {
    practiceName: string;
    address: string;
    telephone: string;
    email?: string;
    alternativeVetAuthorised: boolean;
  };
  security?: {
    keysProvided: boolean;
    furtherInformation?: string;
  };
  agreement?: {
    signedName?: string;
    signatureImage?: string;
    signedAt?: string;
  };
}

export interface Animal {
  _id: string;
  customer: string;
  species: Species;
  breed: string;
  name: string;
  sex: Sex;
  age: number;
  vaccinated: boolean;
  vaccineExpiryDate?: string;
  colourMarkings?: string;
  microchipNumber?: string;
  hasCollar: boolean;
  temperamentNotes?: string;
  aggressionToPeople: boolean;
  aggressionToPeopleDetails?: string;
  aggressionToOtherAnimals: boolean;
  aggressionToOtherAnimalsDetails?: string;
  travelsWellInCar: TriState;
  chasesLivestock: TriState;
  allergies: { status: TriState; details?: string };
  medication: { onMedication: boolean; details?: string };
  offLeadConsent?: { mode: LeadMode; signature?: string };
}

export interface CustomerRef {
  _id: string;
  name: string;
  email: string;
}

export interface Booking {
  _id: string;
  customer: CustomerRef | string;
  animals: Animal[] | string[];
  serviceType: ServiceType;
  startDate: string;
  endDate: string;
  status: BookingStatus;
  notes?: string;
  price?: number;
  createdAt: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  _id: string;
  customer: CustomerRef | string;
  booking?: string;
  invoiceNumber: string;
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paidAt?: string;
  createdAt: string;
}

export interface CrmActivity {
  _id: string;
  customer: CustomerRef | string;
  type: ActivityType;
  subject: string;
  description?: string;
  dueDate?: string;
  completed: boolean;
  createdBy: string;
  createdAt: string;
}
