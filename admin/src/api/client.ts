import type {
  Animal,
  Booking,
  BusinessInfo,
  Customer,
  CrmActivity,
  EmailSettings,
  EmailTemplate,
  EmailTrigger,
  Enquiry,
  Invoice,
  LineItem,
  Staff,
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
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
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
export function listAnimals(customerId: string): Promise<Animal[]> {
  return request(`/animals?customer=${customerId}`);
}
export function createAnimal(input: Record<string, unknown>): Promise<Animal> {
  return request('/animals', { method: 'POST', body: JSON.stringify(input) });
}
export function updateAnimal(id: string, patch: Record<string, unknown>): Promise<Animal> {
  return request(`/animals/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
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
  tax?: number;
  issueDate: string;
  dueDate: string;
}
export function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  return request('/invoices', { method: 'POST', body: JSON.stringify(input) });
}
export function updateInvoiceStatus(id: string, status: string): Promise<Invoice> {
  return request(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
export function deleteInvoice(id: string): Promise<void> {
  return request(`/invoices/${id}`, { method: 'DELETE' });
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

// --- settings ---
export function getBusinessInfo(): Promise<BusinessInfo> {
  return request('/settings/business');
}
export function updateBusinessInfo(patch: Record<string, unknown>): Promise<BusinessInfo> {
  return request('/settings/business', { method: 'PATCH', body: JSON.stringify(patch) });
}
export function previewTerms(termsFile: string): Promise<{ html: string }> {
  return request('/settings/terms/preview', { method: 'POST', body: JSON.stringify({ termsFile }) });
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
