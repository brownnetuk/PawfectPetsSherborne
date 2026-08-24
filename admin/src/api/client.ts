import type {
  Animal,
  AuditLogEntry,
  BankAccount,
  BankAccountStatement,
  BankAccountType,
  Booking,
  BusinessInfo,
  CreditNote,
  Customer,
  CrmActivity,
  EmailSettings,
  EmailTemplate,
  EmailTrigger,
  Enquiry,
  Expense,
  ExpenseCategoryOption,
  ExpenseCategoryTotal,
  FormField,
  FormRecord,
  FormSubmissionRecord,
  IncomeExpenseMonth,
  IncomeMonth,
  Invoice,
  InvoiceTerm,
  LineItem,
  Payment,
  PaymentMethod,
  Product,
  Quote,
  Staff,
  VendorOption,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // Identifies this as the admin web app (as opposed to the mobile app)
      // so the backend can restrict admin logins to Business Info > Trusted
      // IPs without affecting mobile, which is used out in the field.
      'X-Client-App': 'admin',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options?.headers,
    },
  });
  // /auth/login is exempt: there's no session yet to have "expired", and the
  // real reason (wrong password, or an IP not on the Trusted IPs list) is in
  // the response body -- surface that instead of a misleading generic message.
  if (res.status === 401 && path !== '/auth/login') {
    onUnauthorized?.();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    throw new Error(message || `Request failed (${res.status})`);
  }
  // DELETE handlers return 200 with an empty body (not 204), so gate on actual
  // body content rather than status code to avoid "Unexpected end of JSON input".
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// --- auth ---
export function login(email: string, password: string): Promise<{ accessToken: string; staff: Staff }> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}
export function me(): Promise<Staff> {
  return request('/auth/me');
}
export function registerStaff(name: string, email: string, password: string): Promise<Staff> {
  return request('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
}
export function listStaff(): Promise<Staff[]> {
  return request('/auth/staff');
}
export function deleteStaff(id: string): Promise<void> {
  return request(`/auth/staff/${id}`, { method: 'DELETE' });
}

// --- customers ---
export function listCustomers(): Promise<Customer[]> {
  return request('/customers');
}
export function getCustomer(id: string): Promise<Customer> {
  return request(`/customers/${id}`);
}
export function createLead(name: string, email: string): Promise<Customer> {
  return request('/customers/leads', { method: 'POST', body: JSON.stringify({ name, email }) });
}
export function deleteCustomer(id: string): Promise<void> {
  return request(`/customers/${id}`, { method: 'DELETE' });
}
export async function getAlarmInstructions(id: string): Promise<string | null> {
  const { instructions } = await request<{ instructions: string | null }>(
    `/customers/${id}/alarm-instructions`,
  );
  return instructions;
}
export function updateCustomer(id: string, patch: Record<string, unknown>): Promise<Customer> {
  return request(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}
export function updateCustomerStatus(id: string, status: string): Promise<Customer> {
  return request(`/customers/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

// --- animals ---
export function listAnimals(customerId?: string): Promise<Animal[]> {
  return request(`/animals${customerId ? `?customer=${customerId}` : ''}`);
}
export function createAnimal(input: Record<string, unknown>): Promise<Animal> {
  return request('/animals', { method: 'POST', body: JSON.stringify(input) });
}
export function updateAnimal(id: string, patch: Record<string, unknown>): Promise<Animal> {
  return request(`/animals/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}
export function deleteAnimal(id: string): Promise<void> {
  return request(`/animals/${id}`, { method: 'DELETE' });
}

// --- bookings ---
export function listBookings(customerId?: string): Promise<Booking[]> {
  return request(`/bookings${customerId ? `?customer=${customerId}` : ''}`);
}
export interface CreateBookingInput {
  customer: string;
  animals: string[];
  serviceType: string;
  startDate: string;
  endDate: string;
  notes?: string;
  price?: number;
}
export function createBooking(input: CreateBookingInput): Promise<Booking> {
  return request('/bookings', { method: 'POST', body: JSON.stringify(input) });
}
export function updateBookingStatus(id: string, status: string): Promise<Booking> {
  return request(`/bookings/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
export function updateBooking(id: string, patch: Record<string, unknown>): Promise<Booking> {
  return request(`/bookings/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}
export function deleteBooking(id: string): Promise<void> {
  return request(`/bookings/${id}`, { method: 'DELETE' });
}

// --- invoices ---
export function listInvoices(customerId?: string): Promise<Invoice[]> {
  return request(`/invoices${customerId ? `?customer=${customerId}` : ''}`);
}
export interface CreateInvoiceInput {
  customer: string;
  booking?: string;
  lineItems: LineItem[];
  issueDate: string;
  dueDate: string;
  paymentTerms?: string;
  subject?: string;
}
export function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  return request('/invoices', { method: 'POST', body: JSON.stringify(input) });
}
export function updateInvoice(id: string, input: Partial<CreateInvoiceInput>): Promise<Invoice> {
  return request(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function updateInvoiceStatus(id: string, status: string): Promise<Invoice> {
  return request(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
export function deleteInvoice(id: string): Promise<void> {
  return request(`/invoices/${id}`, { method: 'DELETE' });
}
export function sendInvoiceEmail(id: string): Promise<Invoice> {
  return request(`/invoices/${id}/send`, { method: 'POST' });
}

// --- quotes ---
export function listQuotes(customerId?: string): Promise<Quote[]> {
  return request(`/quotes${customerId ? `?customer=${customerId}` : ''}`);
}
export interface CreateQuoteInput {
  customer: string;
  booking?: string;
  lineItems: LineItem[];
  issueDate: string;
  validUntil: string;
  paymentTerms?: string;
  subject?: string;
}
export function createQuote(input: CreateQuoteInput): Promise<Quote> {
  return request('/quotes', { method: 'POST', body: JSON.stringify(input) });
}
export function updateQuote(id: string, input: Partial<CreateQuoteInput>): Promise<Quote> {
  return request(`/quotes/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function updateQuoteStatus(id: string, status: string): Promise<Quote> {
  return request(`/quotes/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
export function deleteQuote(id: string): Promise<void> {
  return request(`/quotes/${id}`, { method: 'DELETE' });
}
export function sendQuoteEmail(id: string): Promise<Quote> {
  return request(`/quotes/${id}/send`, { method: 'POST' });
}

// --- invoice terms ---
export function listInvoiceTerms(): Promise<InvoiceTerm[]> {
  return request('/invoice-terms');
}
export interface InvoiceTermInput {
  text: string;
  plusDays?: number | null;
  endOfMonth?: boolean;
  isDefault?: boolean;
}
export function createInvoiceTerm(input: InvoiceTermInput): Promise<InvoiceTerm> {
  return request('/invoice-terms', { method: 'POST', body: JSON.stringify(input) });
}
export function updateInvoiceTerm(id: string, input: InvoiceTermInput): Promise<InvoiceTerm> {
  return request(`/invoice-terms/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteInvoiceTerm(id: string): Promise<void> {
  return request(`/invoice-terms/${id}`, { method: 'DELETE' });
}

// --- payment methods ---
export function listPaymentMethods(): Promise<PaymentMethod[]> {
  return request('/payment-methods');
}
export interface PaymentMethodInput {
  name: string;
}
export function createPaymentMethod(input: PaymentMethodInput): Promise<PaymentMethod> {
  return request('/payment-methods', { method: 'POST', body: JSON.stringify(input) });
}
export function updatePaymentMethod(id: string, input: PaymentMethodInput): Promise<PaymentMethod> {
  return request(`/payment-methods/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deletePaymentMethod(id: string): Promise<void> {
  return request(`/payment-methods/${id}`, { method: 'DELETE' });
}

// --- bank accounts ---
export function listBankAccounts(): Promise<BankAccount[]> {
  return request('/bank-accounts');
}
export interface BankAccountInput {
  type?: BankAccountType;
  name: string;
  sortCode: string;
  accountNumber: string;
}
export function createBankAccount(input: BankAccountInput): Promise<BankAccount> {
  return request('/bank-accounts', { method: 'POST', body: JSON.stringify(input) });
}
export function updateBankAccount(id: string, input: BankAccountInput): Promise<BankAccount> {
  return request(`/bank-accounts/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteBankAccount(id: string): Promise<void> {
  return request(`/bank-accounts/${id}`, { method: 'DELETE' });
}
export function getBankAccountTransactions(
  id: string,
  month: number,
  year: number,
): Promise<BankAccountStatement> {
  return request(`/bank-accounts/${id}/transactions?month=${month}&year=${year}`);
}
export function setBankAccountOpeningBalance(
  id: string,
  date: string,
  balance: number,
): Promise<BankAccount> {
  return request(`/bank-accounts/${id}/opening-balance`, {
    method: 'PATCH',
    body: JSON.stringify({ date, balance }),
  });
}

// --- payments ---
export function listPayments(): Promise<Payment[]> {
  return request('/payments');
}
export interface PaymentInput {
  invoice: string;
  date: string;
  amount: number;
  charges?: number;
  paymentMethod?: string;
  account: string;
}
export function createPayment(input: PaymentInput): Promise<Payment> {
  return request('/payments', { method: 'POST', body: JSON.stringify(input) });
}
export function deletePayment(id: string): Promise<void> {
  return request(`/payments/${id}`, { method: 'DELETE' });
}

// --- expenses ---
export function listExpenses(from?: string, to?: string): Promise<Expense[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return request(`/expenses${qs ? `?${qs}` : ''}`);
}
export interface ExpenseInput {
  date: string;
  category: string;
  payee?: string;
  description: string;
  amount: number;
  account?: string;
  receipt?: string;
}
export function createExpense(input: ExpenseInput): Promise<Expense> {
  return request('/expenses', { method: 'POST', body: JSON.stringify(input) });
}
export function updateExpense(id: string, input: ExpenseInput): Promise<Expense> {
  return request(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteExpense(id: string): Promise<void> {
  return request(`/expenses/${id}`, { method: 'DELETE' });
}

// --- expense categories ---
export function listExpenseCategories(): Promise<ExpenseCategoryOption[]> {
  return request('/expense-categories');
}
export interface ExpenseCategoryInput {
  name: string;
}
export function createExpenseCategory(input: ExpenseCategoryInput): Promise<ExpenseCategoryOption> {
  return request('/expense-categories', { method: 'POST', body: JSON.stringify(input) });
}
export function updateExpenseCategory(id: string, input: ExpenseCategoryInput): Promise<ExpenseCategoryOption> {
  return request(`/expense-categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteExpenseCategory(id: string): Promise<void> {
  return request(`/expense-categories/${id}`, { method: 'DELETE' });
}

// --- vendors ---
export function listVendors(): Promise<VendorOption[]> {
  return request('/vendors');
}
export interface VendorInput {
  name: string;
}
export function createVendor(input: VendorInput): Promise<VendorOption> {
  return request('/vendors', { method: 'POST', body: JSON.stringify(input) });
}
export function updateVendor(id: string, input: VendorInput): Promise<VendorOption> {
  return request(`/vendors/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteVendor(id: string): Promise<void> {
  return request(`/vendors/${id}`, { method: 'DELETE' });
}

// --- credit notes ---
export function listCreditNotes(customerId?: string): Promise<CreditNote[]> {
  return request(`/credit-notes${customerId ? `?customer=${customerId}` : ''}`);
}
export interface CreditNoteInput {
  customer: string;
  invoice?: string;
  date: string;
  amount: number;
  reason: string;
  account?: string;
}
export function createCreditNote(input: CreditNoteInput): Promise<CreditNote> {
  return request('/credit-notes', { method: 'POST', body: JSON.stringify(input) });
}
export function deleteCreditNote(id: string): Promise<void> {
  return request(`/credit-notes/${id}`, { method: 'DELETE' });
}

// --- reports ---
export function getIncomeExpenseReport(months: number): Promise<IncomeExpenseMonth[]> {
  return request(`/reports/income-vs-expenses?months=${months}`);
}
export function getExpensesByCategoryReport(months: number): Promise<ExpenseCategoryTotal[]> {
  return request(`/reports/expenses-by-category?months=${months}`);
}

// --- products ---
export function listProducts(): Promise<Product[]> {
  return request('/products');
}
export interface CreateProductInput {
  productCode: string;
  name: string;
  description?: string;
  price: number;
}
export function createProduct(input: CreateProductInput): Promise<Product> {
  return request('/products', { method: 'POST', body: JSON.stringify(input) });
}
export function updateProduct(id: string, input: CreateProductInput): Promise<Product> {
  return request(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteProduct(id: string): Promise<void> {
  return request(`/products/${id}`, { method: 'DELETE' });
}

// --- CRM ---
export function listActivities(customerId?: string): Promise<CrmActivity[]> {
  return request(`/crm/activities${customerId ? `?customer=${customerId}` : ''}`);
}
export interface CreateActivityInput {
  customer: string;
  type: string;
  subject: string;
  description?: string;
  dueDate?: string;
  createdBy: string;
}
export function createActivity(input: CreateActivityInput): Promise<CrmActivity> {
  return request('/crm/activities', { method: 'POST', body: JSON.stringify(input) });
}
export function updateActivity(id: string, patch: Partial<CrmActivity>): Promise<CrmActivity> {
  return request(`/crm/activities/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}
export function deleteActivity(id: string): Promise<void> {
  return request(`/crm/activities/${id}`, { method: 'DELETE' });
}

// --- audit log ("Activity" tab -- automatic, distinct from CRM "Notes" above) ---
export function listAuditLog(customerId: string): Promise<AuditLogEntry[]> {
  return request(`/audit-log?customer=${customerId}`);
}
export function getIncomeChart(customerId: string, months: number): Promise<IncomeMonth[]> {
  return request(`/audit-log/income?customer=${customerId}&months=${months}`);
}

// --- settings ---
export function getBusinessInfo(): Promise<BusinessInfo> {
  return request('/settings/business');
}
export function getMyIp(): Promise<{ ip: string | null }> {
  return request('/settings/my-ip');
}
export function updateBusinessInfo(patch: Record<string, unknown>): Promise<BusinessInfo> {
  return request('/settings/business', { method: 'PATCH', body: JSON.stringify(patch) });
}
export function previewTerms(termsFile: string): Promise<{ html: string }> {
  return request('/settings/terms/preview', { method: 'POST', body: JSON.stringify({ termsFile }) });
}
// Bypasses the shared `request` helper, which assumes a JSON response body --
// this one is a binary file download instead.
export async function downloadTermsFile(): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API_URL}/settings/terms/download`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });
  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  return { blob: await res.blob(), filename: match ? match[1] : 'terms.docx' };
}
export function getEmailSettings(): Promise<EmailSettings> {
  return request('/settings/email');
}
export function updateEmailSettings(patch: Record<string, unknown>): Promise<EmailSettings> {
  return request('/settings/email', { method: 'PATCH', body: JSON.stringify(patch) });
}
export function sendTestEmail(to: string): Promise<void> {
  return request('/settings/email/test', { method: 'POST', body: JSON.stringify({ to }) });
}
export function sendTriggeredEmail(
  trigger: EmailTrigger,
  to: string,
  name: string,
  link: string,
): Promise<void> {
  return request('/settings/email/send', {
    method: 'POST',
    body: JSON.stringify({ trigger, to, name, link }),
  });
}
export function listEmailTemplates(): Promise<EmailTemplate[]> {
  return request('/settings/email-templates');
}
export function saveEmailTemplate(
  trigger: EmailTrigger,
  patch: { name: string; subject: string; body: string },
): Promise<EmailTemplate> {
  return request(`/settings/email-templates/${trigger}`, { method: 'PUT', body: JSON.stringify(patch) });
}
export function deleteEmailTemplate(trigger: EmailTrigger): Promise<void> {
  return request(`/settings/email-templates/${trigger}`, { method: 'DELETE' });
}

// --- forms ---
export function listForms(): Promise<FormRecord[]> {
  return request('/forms');
}
export function getForm(id: string): Promise<FormRecord> {
  return request(`/forms/${id}`);
}
export interface FormInput {
  name: string;
  description?: string;
  fields: FormField[];
}
export function createForm(input: FormInput): Promise<FormRecord> {
  return request('/forms', { method: 'POST', body: JSON.stringify(input) });
}
export function updateForm(id: string, input: FormInput): Promise<FormRecord> {
  return request(`/forms/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteForm(id: string): Promise<void> {
  return request(`/forms/${id}`, { method: 'DELETE' });
}

// --- form submissions ---
export interface CreateFormSubmissionInput {
  form: string;
  customer?: string;
  recipientEmail: string;
  recipientName?: string;
}
export function createFormSubmission(input: CreateFormSubmissionInput): Promise<FormSubmissionRecord> {
  return request('/form-submissions', { method: 'POST', body: JSON.stringify(input) });
}
export function listFormSubmissions(customerId?: string): Promise<FormSubmissionRecord[]> {
  return request(`/form-submissions${customerId ? `?customer=${customerId}` : ''}`);
}
export function getFormSubmission(id: string): Promise<FormSubmissionRecord> {
  return request(`/form-submissions/${id}`);
}
export interface UpdateFormSubmissionInput {
  recipientName?: string;
  recipientEmail?: string;
}
export function updateFormSubmission(
  id: string,
  input: UpdateFormSubmissionInput,
): Promise<FormSubmissionRecord> {
  return request(`/form-submissions/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteFormSubmission(id: string): Promise<void> {
  return request(`/form-submissions/${id}`, { method: 'DELETE' });
}

// --- enquiries ---
export function listEnquiries(): Promise<Enquiry[]> {
  return request('/enquiries');
}
export interface CreateEnquiryInput {
  name: string;
  email?: string;
  address?: string;
  phone?: string;
  howHeard?: string;
  servicesInterested?: string[];
  notes?: string;
}
export function createEnquiry(input: CreateEnquiryInput): Promise<Enquiry> {
  return request('/enquiries', { method: 'POST', body: JSON.stringify(input) });
}
export function deleteEnquiry(id: string): Promise<void> {
  return request(`/enquiries/${id}`, { method: 'DELETE' });
}
