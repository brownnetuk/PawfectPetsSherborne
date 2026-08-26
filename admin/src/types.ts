export type CustomerStatus = 'pending' | 'active' | 'inactive' | 'update_info';
export type Species = 'dog' | 'cat' | 'other';
export type Sex = 'male' | 'female';
export type TriState = 'yes' | 'no' | 'unsure';
export type LeadMode = 'on_lead' | 'off_lead';
export type NeuteredStatus = 'neutered' | 'spayed' | 'no';
export type ServiceType = 'boarding' | 'daycare' | 'grooming' | 'walking';
export type BookingStatus = 'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';
export type ActivityType = 'note' | 'call' | 'email' | 'task' | 'status_change';

export interface Staff {
  id: string;
  name: string;
  email: string;
  isBreakGlass: boolean;
}

export interface Customer {
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
  status: CustomerStatus;
  createdAt: string;
  emergencyContact?: {
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
  };
  emergencyVet?: {
    practiceName: string;
    address1?: string;
    address2?: string;
    town?: string;
    county?: string;
    postcode?: string;
    address?: string;
    telephone: string;
    email?: string;
    authorisation?: {
      signedName?: string;
      signatureImage?: string;
      signedAt?: string;
    };
    alternativeVetAuthorised?: boolean;
  };
  security?: {
    keysProvided: boolean;
    furtherInformation?: string;
  };
  agreement?: {
    signedName?: string;
    signatureImage?: string;
    signedAt?: string;
    termsVersion?: string;
    termsDocumentDate?: string;
  };
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

export interface Animal {
  _id: string;
  customer: string;
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
  insured?: boolean;
  insurer?: string;
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
  allergies: { status: TriState; details?: string };
  // `details` is legacy (a single free-text field, superseded by `medications`)
  // -- read-only, kept only so an animal recorded before this change still
  // shows what was typed instead of going blank; never written by current code.
  medication: { onMedication: boolean; medications?: MedicationEntry[]; details?: string };
  offLeadConsent?: { mode: LeadMode; signature?: string };
}

export interface CustomerRef {
  _id: string;
  name: string;
  email: string;
  address?: string;
  phoneNumber?: string;
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
  amountPaid?: number;
  createdAt: string;
}

export interface InvoiceTerm {
  _id: string;
  text: string;
  plusDays?: number | null;
  endOfMonth?: boolean;
  isDefault?: boolean;
  createdAt: string;
}

export interface PaymentMethod {
  _id: string;
  name: string;
  createdAt: string;
}

export type BankAccountType = 'bank' | 'savings';

export interface BankAccount {
  _id: string;
  type: BankAccountType;
  name: string;
  sortCode: string;
  accountNumber: string;
  currentBalance?: number;
  openingBalanceDate?: string;
  openingBalance?: number;
  createdAt: string;
}

export interface BankTransaction {
  date: string;
  description: string;
  amount: number;
  balance: number;
  type: 'payment' | 'expense' | 'credit_note';
}

export interface BankAccountStatement {
  openingBalance: number;
  transactions: BankTransaction[];
}

export interface Payment {
  _id: string;
  paymentId: string;
  // null is a defensive case, not an expected one: the backend now blocks
  // deleting an invoice/account that still has payments against it, but
  // older data (or a future gap in that guard) could still leave a populated
  // ref dangling, so this stays nullable rather than assuming it never is.
  invoice: { _id: string; invoiceNumber: string } | string | null;
  date: string;
  amount: number;
  charges?: number;
  paymentMethod?: string;
  account: { _id: string; name: string; type: BankAccountType } | string | null;
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

export interface ExpenseCategoryOption {
  _id: string;
  name: string;
  createdAt: string;
}

export interface VendorOption {
  _id: string;
  name: string;
  createdAt: string;
}

export interface Expense {
  _id: string;
  date: string;
  category: string;
  payee?: string;
  description: string;
  amount: number;
  account?: { _id: string; name: string; type: BankAccountType } | string;
  receipt?: string;
  createdAt: string;
}

export interface CreditNote {
  _id: string;
  creditNoteNumber: string;
  customer: { _id: string; name: string; email: string } | string;
  invoice?: { _id: string; invoiceNumber: string } | string;
  date: string;
  amount: number;
  reason: string;
  account?: { _id: string; name: string; type: BankAccountType } | string;
  createdAt: string;
}

export interface IncomeExpenseMonth {
  month: string; // 'YYYY-MM'
  income: number;
  expenses: number;
  net: number;
}

export interface ExpenseCategoryTotal {
  category: string;
  total: number;
}

export interface Quote {
  _id: string;
  // Absent for a quote raised against a "Manual Customer" placeholder that
  // isn't a real Customer record yet (see manualCustomerName/Email below) --
  // filled in automatically once the quote is marked accepted.
  customer?: CustomerRef | string;
  manualCustomerName?: string;
  manualCustomerEmail?: string;
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

// Deliberately separate from CrmActivity above -- that's a manually-authored
// note/call/email/task log (the "Notes" tab); this is an automatic,
// system-generated audit trail (the "Activity" tab) staff never write to.
export type AuditEventType =
  | 'customer_created'
  | 'customer_updated'
  | 'invoice_created'
  | 'invoice_updated'
  | 'invoice_emailed'
  | 'invoice_removed'
  | 'quote_created'
  | 'quote_updated'
  | 'quote_emailed'
  | 'quote_removed'
  | 'payment_received'
  | 'payment_removed'
  | 'animal_created'
  | 'animal_updated'
  | 'animal_removed'
  | 'booking_created'
  | 'booking_updated'
  | 'booking_removed'
  | 'credit_note_issued'
  | 'credit_note_removed'
  | 'form_submitted'
  | 'registration_email_sent'
  | 'email_read'
  | 'invoice_read'
  | 'quote_read'
  | 'deposit_requested';

export interface AuditLogEntry {
  _id: string;
  customer: string;
  invoice?: string;
  type: AuditEventType;
  title: string;
  description?: string;
  amount?: number;
  actor: string;
  createdAt: string;
  attachmentData?: string;
  attachmentName?: string;
}

export interface IncomeMonth {
  month: string; // 'YYYY-MM'
  total: number;
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
  termsVersion: string;
  termsDocumentDate: string;
  emergencyVetAuthorisationText: string;
  offLeadConsentText: string;
  declarationText: string;
  depositPercentage: number;
  bankName: string;
  sortCode: string;
  accountNumber: string;
  invoiceNotesMessage: string;
  quoteNotesMessage: string;
  invoiceNumberTemplate: string;
  invoiceNextNumber: number;
  quoteNumberTemplate: string;
  quoteNextNumber: number;
  paymentNumberTemplate: string;
  paymentNextNumber: number;
  creditNoteNumberTemplate: string;
  creditNoteNextNumber: number;
  invoicePdfTemplate: PdfTemplateElement[];
  trustedIps: string[];
}

// --- Invoice/Quote PDF template (Settings > Invoices > PDF Template designer) ---

export type PdfVisibility = 'always' | 'paid' | 'unpaid' | 'invoice-only' | 'quote-only';

interface PdfElementBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visibleWhen?: PdfVisibility;
  groupId?: string;
}

export interface PdfTextElement extends PdfElementBase {
  type: 'text';
  content: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  color: string;
  align: 'left' | 'center' | 'right';
  rotation?: number;
}

export interface PdfImageElement extends PdfElementBase {
  type: 'image';
  src: 'logo';
}

export interface PdfLineElement extends PdfElementBase {
  type: 'line';
  strokeColor: string;
  lineWidth: number;
}

export interface PdfRectElement extends PdfElementBase {
  type: 'rect';
  fillColor?: string;
  strokeColor?: string;
}

export interface PdfQrElement extends PdfElementBase {
  type: 'qrcode';
  content: string;
}

export interface PdfItemTableElement extends PdfElementBase {
  type: 'itemTable';
}

export type PdfTemplateElement =
  | PdfTextElement
  | PdfImageElement
  | PdfLineElement
  | PdfRectElement
  | PdfQrElement
  | PdfItemTableElement;

export type PdfElementType = PdfTemplateElement['type'];

export interface EmailSettings {
  tenantId: string;
  clientId: string;
  fromAddress: string;
  fromName: string;
  clientSecretConfigured: boolean;
}

export type EmailTrigger =
  | 'registration'
  | 'update_info'
  | 'add_pet'
  | 'invoice'
  | 'quote'
  | 'payment_received'
  | 'form'
  | 'deposit_request';

export interface EmailTemplate {
  trigger: EmailTrigger;
  name: string;
  subject: string;
  body: string;
}

// --- Forms builder (Settings > Forms) ---

export type FieldTarget = 'customer' | 'animal';

export interface FieldMapping {
  target: FieldTarget;
  // Dot-path into the Customer/Animal record -- see admin/src/utils/formFieldCatalog.ts
  // for the catalog of valid paths this can point at.
  path: string;
}

export interface VisibilityCondition {
  fieldId: string;
  equals: string;
}

export interface VisibilityRule {
  mode: 'all' | 'any';
  conditions: VisibilityCondition[];
}

export interface FormFieldBase {
  id: string;
  label: string;
  required: boolean;
  mapping?: FieldMapping;
  visibleWhen?: VisibilityRule;
}

export type SimpleFormField = FormFieldBase & {
  type: 'text' | 'textarea' | 'number' | 'date' | 'toggle' | 'signature';
};

// Read-only, non-interactive block of staff-authored text -- `label` holds
// the displayed text itself. Never mapped, never required.
export type DisplayFormField = FormFieldBase & {
  type: 'display';
};

// Auto-filled, non-editable -- the answer is the date (or date+time) at the
// moment the customer opens the form. Never required.
export type AutoDateFormField = FormFieldBase & {
  type: 'today' | 'datetime';
};

export type FileFormField = FormFieldBase & {
  type: 'file';
  maxFiles?: number;
};

export type ChoiceFormField = FormFieldBase & {
  type: 'choice' | 'multichoice';
  options: string[];
};

// Repeatable group -- nested fields map only to target: 'animal'; each
// repetition the customer fills in on the public form creates one Animal.
export type GroupFormField = FormFieldBase & {
  type: 'group';
  repeatable: true;
  minRepeats: number;
  maxRepeats?: number;
  createsAnimal?: boolean;
  fields: FormField[];
};

export type FormField =
  SimpleFormField | FileFormField | ChoiceFormField | GroupFormField | DisplayFormField | AutoDateFormField;

export interface FormRecord {
  _id: string;
  name: string;
  description?: string;
  fields: FormField[];
  createdAt: string;
}

export type FormSubmissionStatus = 'pending' | 'completed';

export interface FormSubmissionRecord {
  _id: string;
  form: string;
  formName: string;
  formDescription?: string;
  formFieldsSnapshot: FormField[];
  status: FormSubmissionStatus;
  customer?: CustomerRef | string;
  recipientEmail: string;
  recipientName?: string;
  answers?: Record<string, unknown>;
  submittedAt?: string;
  createdAt: string;
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
