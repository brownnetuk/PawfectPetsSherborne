export type CustomerStatus = 'pending' | 'active' | 'inactive' | 'update_info';
export type Species = 'dog' | 'cat' | 'other';
export type Sex = 'male' | 'female';
export type TriState = 'yes' | 'no' | 'unsure';
export type LeadMode = 'on_lead' | 'off_lead';
export type ServiceType = 'boarding' | 'daycare' | 'grooming' | 'walking';
export type BookingStatus = 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
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
  discountPercent?: number;
}

export interface Invoice {
  _id: string;
  customer: CustomerRef | string;
  booking?: string;
  invoiceNumber: string;
  lineItems: LineItem[];
  subtotal: number;
  total: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paymentTerms?: string;
  subject?: string;
  paidAt?: string;
  openedAt?: string;
  createdAt: string;
}

export interface InvoiceTerm {
  _id: string;
  text: string;
  plusDays?: number | null;
  endOfMonth?: boolean;
  createdAt: string;
}

export interface Product {
  _id: string;
  productCode: string;
  name: string;
  description?: string;
  price: number;
  createdAt: string;
}

export interface Quote {
  _id: string;
  customer: CustomerRef | string;
  booking?: string;
  quoteNumber: string;
  lineItems: LineItem[];
  subtotal: number;
  total: number;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  paymentTerms?: string;
  subject?: string;
  openedAt?: string;
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

export interface BusinessInfo {
  name: string;
  address: string;
  town: string;
  postcode: string;
  telephone: string;
  email: string;
  website: string;
  logoImage: string;
  termsHtml: string;
  termsFileName: string;
  bankName: string;
  sortCode: string;
  accountNumber: string;
  invoiceNumberTemplate: string;
  invoiceNextNumber: number;
  quoteNumberTemplate: string;
  quoteNextNumber: number;
}

export interface EmailSettings {
  tenantId: string;
  clientId: string;
  fromAddress: string;
  fromName: string;
  clientSecretConfigured: boolean;
}

export type EmailTrigger = 'registration' | 'update_info' | 'add_pet' | 'invoice' | 'quote';

export interface EmailTemplate {
  trigger: EmailTrigger;
  name: string;
  subject: string;
  body: string;
}

export type EnquiryService = 'dog_walking' | 'pet_visits' | 'boarding' | 'day_care';

export interface Enquiry {
  _id: string;
  name: string;
  email?: string;
  address?: string;
  phone?: string;
  howHeard?: string;
  servicesInterested: EnquiryService[];
  notes?: string;
  createdAt: string;
}
