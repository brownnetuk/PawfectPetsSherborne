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
  termsAccepted?: boolean;
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
  insured: boolean | null;
  insurer?: string;
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
// the displayed text itself.
export type DisplayFormField = FormFieldBase & {
  type: 'display';
};

// Auto-filled, non-editable -- the answer is the date (or date+time) at the
// moment the customer opens the form.
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

export type GroupFormField = FormFieldBase & {
  type: 'group';
  repeatable: true;
  minRepeats: number;
  maxRepeats?: number;
  fields: FormField[];
};

export type FormField =
  SimpleFormField | FileFormField | ChoiceFormField | GroupFormField | DisplayFormField | AutoDateFormField;

export interface FormSubmissionPublic {
  _id: string;
  formName: string;
  formDescription?: string;
  fields: FormField[];
  status: 'pending' | 'completed';
  recipientName?: string;
  answers?: Record<string, unknown>;
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

// --- Public invoice/quote view (`/invoices/:id`, `/quotes/:id`) --
// mirrors the equivalent types in admin/src/types.ts, kept in sync by hand
// since these two frontends don't share a package.

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export interface DocCustomerRef {
  _id: string;
  name: string;
  email: string;
  address?: string;
  phoneNumber?: string;
}

export interface DocLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
}

export interface InvoiceRecord {
  _id: string;
  customer: DocCustomerRef | string;
  invoiceNumber: string;
  lineItems: DocLineItem[];
  subtotal: number;
  total: number;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paymentTerms?: string;
  subject?: string;
  paidAt?: string;
  amountPaid?: number;
}

export interface QuoteRecord {
  _id: string;
  customer?: DocCustomerRef | string;
  manualCustomerName?: string;
  manualCustomerEmail?: string;
  quoteNumber: string;
  lineItems: DocLineItem[];
  subtotal: number;
  total: number;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  paymentTerms?: string;
  subject?: string;
}

export interface PublicBusinessInfo {
  name: string;
  address: string;
  town: string;
  postcode: string;
  telephone: string;
  email: string;
  website: string;
  logoImage: string;
  bankName: string;
  sortCode: string;
  accountNumber: string;
  invoiceNotesMessage: string;
  quoteNotesMessage: string;
  invoicePdfTemplate: PdfTemplateElement[];
}

// --- Invoice/Quote PDF template (staff-designed in Settings > Invoices >
// PDF Template) -- same shape as admin/src/types.ts, needed here purely to
// render the same layout when a customer downloads their invoice/quote PDF
// from the public page.

export type PdfVisibility = 'always' | 'paid' | 'unpaid';

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
