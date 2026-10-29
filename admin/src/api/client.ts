import type {
  Animal,
  AnnualLeave,
  Appointment,
  AuditLogEntry,
  BankAccount,
  BankAccountStatement,
  BankAccountType,
  BankHoliday,
  BankTransfer,
  BoardingBooking,
  BoardingBookingWithStatus,
  BoardingWorkflowSettings,
  BookingObservation,
  Booking,
  BookingStatusLabel,
  ImportedRiskAssessmentDraft,
  ObservationCategory,
  BusinessInfo,
  ChecklistAssignment,
  ChecklistCategory,
  ChecklistSession,
  ChecklistTemplate,
  Conversation,
  CreditNote,
  Customer,
  CrmActivity,
  DayBooking,
  EmailGroup,
  EmailMessage,
  EmailSettings,
  EmailTemplate,
  EmailTrigger,
  Enquiry,
  Expense,
  ExpenseCategoryOption,
  ExpenseCategoryTotal,
  FormField,
  FormRecord,
  FormSubmissionPublic,
  FormSubmissionRecord,
  IncidentReportRecord,
  IncomeExpenseMonth,
  IncomeMonth,
  Invoice,
  InvoiceTerm,
  LineItem,
  Message,
  MyTrainingListEntry,
  OtherIncome,
  Payment,
  PaymentMethod,
  PreBoardingFormRecord,
  PreBoardingQuestion,
  PreBoardingSettings,
  Policy,
  Product,
  ProductAvailability,
  PushMessage,
  Quote,
  QuoteBoardingPlan,
  QuoteDayCarePlan,
  QuoteVisitPlan,
  RiskAssessment,
  Role,
  Staff,
  StartAttemptResult,
  SubmitAttemptResult,
  TrainingAttempt,
  TrainingComplianceRow,
  TrainingModule,
  VendorOption,
  VetPractice,
  VisitMapping,
} from '../types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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
export function login(
  username: string,
  password: string,
  rememberMe = false,
): Promise<{ accessToken: string; staff: Staff }> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, rememberMe }),
  });
}
export function me(): Promise<Staff> {
  return request('/auth/me');
}
export function registerStaff(
  name: string,
  username: string,
  email: string,
  password: string,
  isBreakGlass?: boolean,
  role?: string,
): Promise<Staff> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, username, email, password, isBreakGlass, role: role || undefined }),
  });
}
export function listStaff(): Promise<Staff[]> {
  return request('/auth/staff');
}
export function updateStaff(
  id: string,
  patch: Partial<{
    name: string;
    username: string;
    email: string;
    isBreakGlass: boolean;
    locked: boolean;
    role: string | null;
  }>,
): Promise<Staff> {
  return request(`/auth/staff/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}
export function changeStaffPassword(id: string, password: string): Promise<void> {
  return request(`/auth/staff/${id}/password`, { method: 'POST', body: JSON.stringify({ password }) });
}
export function deleteStaff(id: string): Promise<void> {
  return request(`/auth/staff/${id}`, { method: 'DELETE' });
}

// --- roles (Settings > Staff > Access Permissions) ---
export function listRoles(): Promise<Role[]> {
  return request('/roles');
}
export function createRole(input: { name: string; permissions: string[] }): Promise<Role> {
  return request('/roles', { method: 'POST', body: JSON.stringify(input) });
}
export function updateRole(id: string, input: { name: string; permissions: string[] }): Promise<Role> {
  return request(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteRole(id: string): Promise<void> {
  return request(`/roles/${id}`, { method: 'DELETE' });
}

// --- customers ---
export function listCustomers(): Promise<Customer[]> {
  return request('/customers');
}
export function getCustomer(id: string): Promise<Customer> {
  return request(`/customers/${id}`);
}
export function createLead(
  firstName: string,
  surname: string | undefined,
  email: string,
  sendEmail = true,
): Promise<Customer> {
  return request('/customers/leads', {
    method: 'POST',
    body: JSON.stringify({ firstName, surname: surname || undefined, email, sendEmail }),
  });
}
export function deleteCustomer(id: string, force?: boolean): Promise<void> {
  return request(`/customers/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
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
// --- customer portal (Customer Defaults > Customer Portal card) ---
export function setCustomerPortalActive(
  id: string,
  active: boolean,
): Promise<{ portalActive: boolean }> {
  return request(`/customers/${id}/portal`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  });
}
export function sendCustomerPortalReset(id: string): Promise<{ ok: boolean }> {
  return request(`/customers/${id}/portal/reset`, { method: 'POST' });
}
// An additional person with the same app access as the customer.
export interface PortalUser {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  setUp: boolean;
  lastLoginAt: string | null;
  addedAt: string | null;
}
export interface PortalStatus {
  portalActive: boolean;
  // The email the customer's own access is granted for.
  email: string;
  setUp: boolean;
  lastLoginAt: string | null;
  deviceCount: number;
  lastDeviceAt: string | null;
  additionalUsers: PortalUser[];
}
export function addCustomerPortalUser(
  id: string,
  user: { name: string; email: string; phoneNumber: string },
): Promise<PortalStatus> {
  return request(`/customers/${id}/portal/users`, {
    method: 'POST',
    body: JSON.stringify(user),
  });
}
export function removeCustomerPortalUser(id: string, userId: string): Promise<PortalStatus> {
  return request(`/customers/${id}/portal/users/${userId}`, { method: 'DELETE' });
}
export function sendCustomerPortalUserReset(id: string, userId: string): Promise<{ ok: boolean }> {
  return request(`/customers/${id}/portal/users/${userId}/reset`, { method: 'POST' });
}
export function getCustomerPortalStatus(id: string): Promise<PortalStatus> {
  return request(`/customers/${id}/portal/status`);
}
export function sendCustomerPortalTestPush(
  id: string,
  message: string,
): Promise<{ sent: number; total: number; customerPushConfigured: boolean }> {
  return request(`/customers/${id}/portal/test-push`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

// --- messages (staff <-> customer) ---
export function listConversations(): Promise<Conversation[]> {
  return request('/messages/conversations');
}
export function getMessageThread(customerId: string): Promise<Message[]> {
  return request(`/messages/${customerId}`);
}
export function sendMessageToCustomer(customerId: string, body: string): Promise<Message> {
  return request(`/messages/${customerId}`, { method: 'POST', body: JSON.stringify({ body }) });
}
export function messagesUnreadCount(): Promise<{ count: number }> {
  return request('/messages/unread-count');
}
export function deleteMessage(customerId: string, messageId: string): Promise<{ ok: boolean }> {
  return request(`/messages/${customerId}/${messageId}`, { method: 'DELETE' });
}

// --- push messages (Communications > Push Messages, bulk/individual customer pushes) ---
export function listPushMessages(): Promise<PushMessage[]> {
  return request('/push-messages');
}
export interface SendPushMessageInput {
  title: string;
  body: string;
  customerIds: string[];
  acknowledgementRequired?: boolean;
}
export function sendPushMessage(input: SendPushMessageInput): Promise<PushMessage> {
  return request('/push-messages', { method: 'POST', body: JSON.stringify(input) });
}
export function deletePushMessage(id: string): Promise<void> {
  return request(`/push-messages/${id}`, { method: 'DELETE' });
}

// --- email groups (Settings > Email > Email Groups) ---
export function listEmailGroups(): Promise<EmailGroup[]> {
  return request('/email-groups');
}
export function createEmailGroup(input: { name: string; customers?: string[] }): Promise<EmailGroup> {
  return request('/email-groups', { method: 'POST', body: JSON.stringify(input) });
}
export function updateEmailGroup(
  id: string,
  input: Partial<{ name: string; customers: string[] }>,
): Promise<EmailGroup> {
  return request(`/email-groups/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteEmailGroup(id: string): Promise<void> {
  return request(`/email-groups/${id}`, { method: 'DELETE' });
}

// --- email messages (Communications > Email, bulk emails to customers/groups) ---
export function listEmailMessages(): Promise<EmailMessage[]> {
  return request('/email-messages');
}
export interface SendEmailMessageInput {
  subject: string;
  bodyHtml: string;
  customerIds?: string[];
  groupIds?: string[];
}
export function sendEmailMessage(input: SendEmailMessageInput): Promise<EmailMessage> {
  return request('/email-messages', { method: 'POST', body: JSON.stringify(input) });
}
export function deleteEmailMessage(id: string): Promise<void> {
  return request(`/email-messages/${id}`, { method: 'DELETE' });
}
export function logFormSnapshot(
  id: string,
  title: string,
  attachmentData: string,
  attachmentName: string,
  entryId?: string,
): Promise<void> {
  return request(`/customers/${id}/form-snapshot`, {
    method: 'POST',
    body: JSON.stringify({ title, attachmentData, attachmentName, entryId }),
  });
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
export function copyAnimal(id: string, customerId: string): Promise<Animal> {
  return request(`/animals/${id}/copy`, { method: 'POST', body: JSON.stringify({ customerId }) });
}
export function moveAnimal(id: string, customerId: string): Promise<Animal> {
  return request(`/animals/${id}/move`, { method: 'POST', body: JSON.stringify({ customerId }) });
}
export function unlinkAnimal(id: string): Promise<Animal> {
  return request(`/animals/${id}/unlink`, { method: 'POST' });
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

// --- day bookings (the Bookings page calendar: one dog, one day, one product) ---
export function listDayBookings(from: string, to: string): Promise<DayBooking[]> {
  return request(`/day-bookings?from=${from}&to=${to}`);
}
export function listDayBookingsForCustomer(customerId: string): Promise<DayBooking[]> {
  return request(`/day-bookings/by-customer/${customerId}`);
}

// The computed product breakdown for a boarding stay (see the backend's
// DayBookingsService.computeBoardingPlan). start/end are ISO datetimes.
export interface BoardingPlanLine {
  dogIndex: number;
  dayOffset: number;
  kind: 'boarding' | 'halfDay';
  secondDog: boolean;
  productId: string | null;
  placeholder?: boolean;
}
export interface BoardingPlan {
  boardingDays: number;
  partial: 'none' | 'half';
  lines: BoardingPlanLine[];
  missing: string[];
}
export function getBoardingPlan(start: string, end: string, dogCount: number): Promise<BoardingPlan> {
  return request(
    `/day-bookings/boarding-plan?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&dogCount=${dogCount}`,
  );
}
export interface DayBookingInput {
  animal: string;
  additionalAnimals?: string[];
  date: string;
  product: string;
  quantity?: number;
  invoice?: string | null;
  visitTime?: 'AM' | 'PM' | null;
  dropOffPeriod?: 'AM' | 'PM' | null;
  dropOffTime?: string | null;
  collectionPeriod?: 'AM' | 'PM' | null;
  collectionTime?: string | null;
  pickUpTime?: string | null;
  placeholder?: boolean;
  boardingStay?: boolean;
  stayId?: string;
}
export function createDayBooking(input: DayBookingInput): Promise<DayBooking> {
  return request('/day-bookings', { method: 'POST', body: JSON.stringify(input) });
}
// Every row of one boarding stay, for loading it into the edit modal.
export function getBoardingStay(stayId: string): Promise<DayBooking[]> {
  return request(`/day-bookings/stay/${stayId}`);
}
// Deletes a whole boarding stay (edit = delete + recreate).
export function deleteStay(stayId: string): Promise<{ deleted: number }> {
  return request(`/day-bookings/stay/${stayId}`, { method: 'DELETE' });
}
// Puts an edited booking's rebooked rows back on the invoice it was on (and
// on its lines too, while that invoice is unsent).
export function attachDayBookingsToInvoice(bookingIds: string[], invoice: string): Promise<{ attached: number }> {
  return request('/day-bookings/attach-invoice', { method: 'POST', body: JSON.stringify({ bookingIds, invoice }) });
}
export function updateDayBooking(
  id: string,
  input: Partial<Omit<DayBookingInput, 'animal'>>,
): Promise<DayBooking> {
  return request(`/day-bookings/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteDayBooking(id: string): Promise<void> {
  return request(`/day-bookings/${id}`, { method: 'DELETE' });
}

// --- appointments (Bookings page: standalone, non-animal calendar entries) ---
export function listAppointments(from: string, to: string): Promise<Appointment[]> {
  return request(`/appointments?from=${from}&to=${to}`);
}
export interface AppointmentInput {
  customer: string;
  reason: string;
  date: string;
  time: string;
}
export function createAppointment(input: AppointmentInput): Promise<Appointment> {
  return request('/appointments', { method: 'POST', body: JSON.stringify(input) });
}
export function updateAppointment(id: string, input: Partial<AppointmentInput>): Promise<Appointment> {
  return request(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteAppointment(id: string): Promise<void> {
  return request(`/appointments/${id}`, { method: 'DELETE' });
}

// --- invoices ---
export function listInvoices(customerId?: string): Promise<Invoice[]> {
  return request(`/invoices${customerId ? `?customer=${customerId}` : ''}`);
}
export function getInvoice(id: string): Promise<Invoice> {
  return request(`/invoices/${id}`);
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
export function scheduleInvoiceSend(id: string, sendAt: string): Promise<Invoice> {
  return request(`/invoices/${id}/schedule-send`, { method: 'POST', body: JSON.stringify({ sendAt }) });
}
export function cancelScheduledInvoiceSend(id: string): Promise<Invoice> {
  return request(`/invoices/${id}/schedule-send`, { method: 'DELETE' });
}
export function requestDeposit(id: string): Promise<{ depositAmount: number; depositPercentage: number }> {
  return request(`/invoices/${id}/request-deposit`, { method: 'POST' });
}
export function sendOverdueReminder(id: string): Promise<{ balanceDue: number; daysOverdue: number }> {
  return request(`/invoices/${id}/overdue-reminder`, { method: 'POST' });
}

// --- quotes ---
export function listQuotes(customerId?: string): Promise<Quote[]> {
  return request(`/quotes${customerId ? `?customer=${customerId}` : ''}`);
}
export interface CreateQuoteInput {
  // Exactly one of `customer` or manualCustomerName+manualCustomerEmail --
  // see Quote.manualCustomerName in types.ts.
  customer?: string;
  manualCustomerName?: string;
  manualCustomerEmail?: string;
  booking?: string;
  lineItems: LineItem[];
  issueDate: string;
  validUntil: string;
  paymentTerms?: string;
  subject?: string;
  visitPlan?: QuoteVisitPlan | null;
  dayCarePlan?: QuoteDayCarePlan | null;
  boardingPlan?: QuoteBoardingPlan | null;
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

// --- boarding bookings (the new reference-numbered Boarding & Day Care
// workflow -- a separate entity from Booking above, which mobile still uses) ---
export function listBoardingBookings(): Promise<BoardingBookingWithStatus[]> {
  return request('/boarding-bookings');
}
export function getBoardingBooking(id: string): Promise<BoardingBookingWithStatus> {
  return request(`/boarding-bookings/${id}`);
}
export function getBoardingBookingByStay(stayId: string): Promise<BoardingBooking | null> {
  return request(`/boarding-bookings/by-stay/${stayId}`);
}
export interface CreateBoardingBookingInput {
  customer: string;
  animals: string[];
  type: 'boarding' | 'dayCare';
  startDate: string;
  dropOffTime: string;
  endDate?: string;
  pickUpTime: string;
  dropOffPeriod?: 'AM' | 'PM';
  collectionPeriod?: 'AM' | 'PM';
  notes?: string;
}
export function createBoardingBooking(input: CreateBoardingBookingInput): Promise<BoardingBooking> {
  return request('/boarding-bookings', { method: 'POST', body: JSON.stringify(input) });
}
export interface AmendBoardingBookingDatesInput {
  startDate: string;
  dropOffTime: string;
  endDate?: string;
  pickUpTime: string;
  dropOffPeriod?: 'AM' | 'PM';
  collectionPeriod?: 'AM' | 'PM';
}
export function amendBoardingBookingDates(id: string, input: AmendBoardingBookingDatesInput): Promise<BoardingBooking> {
  return request(`/boarding-bookings/${id}/amend-dates`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function requestBoardingBookingPayment(
  id: string,
  type: 'deposit' | 'full',
): Promise<{ depositAmount: number; depositPercentage: number }> {
  return request(`/boarding-bookings/${id}/request-payment`, { method: 'POST', body: JSON.stringify({ type }) });
}
export function sendBoardingBookingPreCheckIn(id: string): Promise<BoardingBooking> {
  return request(`/boarding-bookings/${id}/send-pre-check-in`, { method: 'POST' });
}
export function sendBoardingBookingConfirmation(id: string, attachmentData: string, attachmentName: string): Promise<void> {
  return request(`/boarding-bookings/${id}/send-confirmation`, {
    method: 'POST',
    body: JSON.stringify({ attachmentData, attachmentName }),
  });
}
export function recordBoardingBookingCheckIn(id: string, submissionId: string): Promise<BoardingBooking> {
  return request(`/boarding-bookings/${id}/check-in`, { method: 'POST', body: JSON.stringify({ submission: submissionId }) });
}
export function recordBoardingBookingCheckOut(id: string, submissionId: string): Promise<BoardingBooking> {
  return request(`/boarding-bookings/${id}/check-out`, { method: 'POST', body: JSON.stringify({ submission: submissionId }) });
}
// `status: null` clears a manual override, going back to automatic.
export function setBoardingBookingStatus(
  id: string,
  status: BookingStatusLabel | null,
): Promise<BoardingBookingWithStatus> {
  return request(`/boarding-bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
export function archiveBoardingBooking(id: string, archived: boolean): Promise<BoardingBookingWithStatus> {
  return request(`/boarding-bookings/${id}/archive`, { method: 'PATCH', body: JSON.stringify({ archived }) });
}
// `deleteAll` also removes every payment/credit note recorded against the
// booking's invoice first (each properly reversed, not just deleted) --
// offered as a follow-up once the plain delete blocks on exactly that.
export function deleteBoardingBooking(id: string, deleteAll?: boolean): Promise<void> {
  return request(`/boarding-bookings/${id}${deleteAll ? '?deleteAll=true' : ''}`, { method: 'DELETE' });
}

// --- booking observations (care notes on a boarding/day care booking) ---
export interface BookingObservationInput {
  observedAt: string;
  category: ObservationCategory;
  description?: string;
  photos: string[];
}
export function listBookingObservations(bookingId: string): Promise<BookingObservation[]> {
  return request(`/boarding-bookings/${bookingId}/observations`);
}
export function createBookingObservation(bookingId: string, input: BookingObservationInput): Promise<BookingObservation> {
  return request(`/boarding-bookings/${bookingId}/observations`, { method: 'POST', body: JSON.stringify(input) });
}
export function updateBookingObservation(
  bookingId: string,
  id: string,
  input: BookingObservationInput,
): Promise<BookingObservation> {
  return request(`/boarding-bookings/${bookingId}/observations/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteBookingObservation(bookingId: string, id: string): Promise<void> {
  return request(`/boarding-bookings/${bookingId}/observations/${id}`, { method: 'DELETE' });
}

// --- booking incident reports (Incident Report form submissions on a boarding/day care booking) ---
export function listBookingIncidentReports(bookingId: string): Promise<IncidentReportRecord[]> {
  return request(`/boarding-bookings/${bookingId}/incident-reports`);
}
// Every booking's reports -- Boarding & Day Care > Incident Reports.
export function listIncidentReports(): Promise<IncidentReportRecord[]> {
  return request('/incident-reports');
}
// Starts a new, pending report from Settings > Boarding's incident report
// form -- fill it in with FormFillModal, or deleteBookingIncidentReport() to
// discard it.
export function createBookingIncidentReport(bookingId: string): Promise<FormSubmissionRecord> {
  return request(`/boarding-bookings/${bookingId}/incident-reports`, { method: 'POST' });
}
export function updateBookingIncidentReport(
  bookingId: string,
  id: string,
  answers: Record<string, unknown>,
): Promise<FormSubmissionRecord> {
  return request(`/boarding-bookings/${bookingId}/incident-reports/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ answers }),
  });
}
// Links the report to a different booking (and that booking's customer).
export function moveBookingIncidentReport(bookingId: string, id: string, targetBookingId: string): Promise<FormSubmissionRecord> {
  return request(`/boarding-bookings/${bookingId}/incident-reports/${id}/booking`, {
    method: 'PATCH',
    body: JSON.stringify({ booking: targetBookingId }),
  });
}
export function deleteBookingIncidentReport(bookingId: string, id: string): Promise<void> {
  return request(`/boarding-bookings/${bookingId}/incident-reports/${id}`, { method: 'DELETE' });
}

// --- customer risk assessments (New Dog Intake Risk Assessment form submissions on a customer) ---
// Completed ones, newest first -- every customer's, or just one's.
export function listCustomerRiskAssessments(customerId?: string): Promise<FormSubmissionRecord[]> {
  return request(`/customer-risk-assessments${customerId ? `?customer=${customerId}` : ''}`);
}
// Starts a new, pending one from Settings > Boarding's customer risk
// assessment form -- fill it in with FormFillModal, or
// deleteCustomerRiskAssessment() to discard it.
export function createCustomerRiskAssessment(customerId: string): Promise<FormSubmissionRecord> {
  return request('/customer-risk-assessments', { method: 'POST', body: JSON.stringify({ customer: customerId }) });
}
export function updateCustomerRiskAssessment(id: string, answers: Record<string, unknown>): Promise<FormSubmissionRecord> {
  return request(`/customer-risk-assessments/${id}`, { method: 'PATCH', body: JSON.stringify({ answers }) });
}
// Links the assessment to a different customer.
export function moveCustomerRiskAssessment(id: string, customerId: string): Promise<FormSubmissionRecord> {
  return request(`/customer-risk-assessments/${id}/customer`, {
    method: 'PATCH',
    body: JSON.stringify({ customer: customerId }),
  });
}
export function deleteCustomerRiskAssessment(id: string): Promise<void> {
  return request(`/customer-risk-assessments/${id}`, { method: 'DELETE' });
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
  isDefault?: boolean;
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
  isDefault?: boolean;
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
// Statement for any date range, 'YYYY-MM-DD' with both ends inclusive; leave
// both empty for the account's whole history.
export function getBankAccountStatement(id: string, from: string, to: string): Promise<BankAccountStatement> {
  const params = new URLSearchParams(from || to ? { from, to } : { all: '1' });
  return request(`/bank-accounts/${id}/transactions?${params}`);
}

// --- bank transfers ---
export function listBankTransfers(): Promise<BankTransfer[]> {
  return request('/bank-transfers');
}
export interface BankTransferInput {
  date: string;
  reference?: string;
  fromAccount: string;
  toAccount: string;
  amount: number;
}
export function createBankTransfer(input: BankTransferInput): Promise<BankTransfer> {
  return request('/bank-transfers', { method: 'POST', body: JSON.stringify(input) });
}
export function deleteBankTransfer(id: string): Promise<void> {
  return request(`/bank-transfers/${id}`, { method: 'DELETE' });
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
  // Stops the backend auto-sending the "Thank You" email, so the caller can
  // ask staff first (see PaymentThankYouPrompt).
  skipThankYouEmail?: boolean;
}
export function createPayment(input: PaymentInput): Promise<Payment> {
  return request('/payments', { method: 'POST', body: JSON.stringify(input) });
}
export function deletePayment(id: string): Promise<void> {
  return request(`/payments/${id}`, { method: 'DELETE' });
}
export function sendPaymentReceivedEmail(id: string): Promise<void> {
  return request(`/payments/${id}/send-email`, { method: 'POST' });
}
export function sendPaymentReceipt(id: string, attachmentData: string, attachmentName: string): Promise<void> {
  return request(`/payments/${id}/send-receipt`, {
    method: 'POST',
    body: JSON.stringify({ attachmentData, attachmentName }),
  });
}

// --- other income ---
export function listOtherIncome(): Promise<OtherIncome[]> {
  return request('/other-income');
}
export interface OtherIncomeInput {
  date: string;
  receivedFrom: string;
  description?: string;
  amount: number;
  account: string;
}
export function createOtherIncome(input: OtherIncomeInput): Promise<OtherIncome> {
  return request('/other-income', { method: 'POST', body: JSON.stringify(input) });
}
export function deleteOtherIncome(id: string): Promise<void> {
  return request(`/other-income/${id}`, { method: 'DELETE' });
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
  paymentMethod?: string;
  reference?: string;
  description?: string;
  amount: number;
  // null clears it on an update.
  account?: string | null;
  receipt?: string;
  receiptName?: string;
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
// Emails the expense's stored receipt as an attachment.
export function sendExpenseEmail(id: string, input: { to: string; subject: string; message: string }): Promise<void> {
  return request(`/expenses/${id}/send-email`, { method: 'POST', body: JSON.stringify(input) });
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

// --- vet practices ---
export function listVetPractices(): Promise<VetPractice[]> {
  return request('/vet-practices');
}
export interface VetPracticeInput {
  practiceName: string;
  address1: string;
  address2?: string;
  town: string;
  county?: string;
  postcode: string;
  telephone: string;
  email?: string;
}
export function createVetPractice(input: VetPracticeInput): Promise<VetPractice> {
  return request('/vet-practices', { method: 'POST', body: JSON.stringify(input) });
}
export function updateVetPractice(id: string, input: VetPracticeInput): Promise<VetPractice> {
  return request(`/vet-practices/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteVetPractice(id: string): Promise<void> {
  return request(`/vet-practices/${id}`, { method: 'DELETE' });
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
  availability?: ProductAvailability | null;
  displayInPriceList?: boolean;
}
export function createProduct(input: CreateProductInput): Promise<Product> {
  return request('/products', { method: 'POST', body: JSON.stringify(input) });
}
// Partial: the backend UpdateProductDto is PartialType(CreateProductDto), so
// single-field toggles (e.g. displayInPriceList) can PATCH just that field.
export function updateProduct(id: string, input: Partial<CreateProductInput>): Promise<Product> {
  return request(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteProduct(id: string): Promise<void> {
  return request(`/products/${id}`, { method: 'DELETE' });
}
// Settings > Products CSV import: overwrites products whose productCode
// matches a row, creates the rest.
export function importProducts(products: CreateProductInput[]): Promise<{ created: number; updated: number }> {
  return request('/products/import', { method: 'POST', body: JSON.stringify({ products }) });
}

// --- bank holidays ---
export function listBankHolidays(): Promise<BankHoliday[]> {
  return request('/bank-holidays');
}
export interface BankHolidayInput {
  name: string;
  date: string;
}
export function createBankHoliday(input: BankHolidayInput): Promise<BankHoliday> {
  return request('/bank-holidays', { method: 'POST', body: JSON.stringify(input) });
}
export function updateBankHoliday(id: string, input: BankHolidayInput): Promise<BankHoliday> {
  return request(`/bank-holidays/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteBankHoliday(id: string): Promise<void> {
  return request(`/bank-holidays/${id}`, { method: 'DELETE' });
}

// --- annual leave ---
export function listAnnualLeave(): Promise<AnnualLeave[]> {
  return request('/annual-leave');
}
export interface AnnualLeaveInput {
  name: string;
  startDate: string;
  endDate: string;
}
export function createAnnualLeave(input: AnnualLeaveInput): Promise<AnnualLeave> {
  return request('/annual-leave', { method: 'POST', body: JSON.stringify(input) });
}
export function updateAnnualLeave(id: string, input: AnnualLeaveInput): Promise<AnnualLeave> {
  return request(`/annual-leave/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteAnnualLeave(id: string): Promise<void> {
  return request(`/annual-leave/${id}`, { method: 'DELETE' });
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
  attachments?: string[];
}
// The list endpoint strips attachment images -- this returns them in full.
export function getActivity(id: string): Promise<CrmActivity> {
  return request(`/crm/activities/${id}`);
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
export function listAuditLogForInvoice(invoiceId: string): Promise<AuditLogEntry[]> {
  return request(`/audit-log?invoice=${invoiceId}`);
}
// Settings > Forms "Regenerate registration PDFs" -- metadata only (no
// attachmentData), then the rebuilt PDF goes back one entry at a time.
export interface RegistrationSnapshot {
  _id: string;
  customer: string;
  title: string;
  createdAt: string;
  attachmentName?: string;
  regeneratedAt?: string;
}
export function listRegistrationSnapshots(): Promise<RegistrationSnapshot[]> {
  return request('/audit-log/registration-snapshots');
}
export function deleteOrphanedRegistrationSnapshots(): Promise<{ deleted: number }> {
  return request('/audit-log/registration-snapshots/orphaned', { method: 'DELETE' });
}
export function replaceSnapshotAttachment(entryId: string, attachmentData: string, attachmentName: string): Promise<void> {
  return request(`/audit-log/${entryId}/attachment`, {
    method: 'PATCH',
    body: JSON.stringify({ attachmentData, attachmentName }),
  });
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
export function getVisitMapping(): Promise<VisitMapping> {
  return request('/settings/visits');
}
export function updateVisitMapping(patch: Partial<VisitMapping>): Promise<VisitMapping> {
  return request('/settings/visits', { method: 'PATCH', body: JSON.stringify(patch) });
}
export function getBoardingWorkflowSettings(): Promise<BoardingWorkflowSettings> {
  return request('/settings/boarding');
}
export function updateBoardingWorkflowSettings(
  patch: Partial<BoardingWorkflowSettings>,
): Promise<BoardingWorkflowSettings> {
  return request('/settings/boarding', { method: 'PATCH', body: JSON.stringify(patch) });
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
  customerId?: string,
  formName?: string,
): Promise<{ entryId?: string }> {
  return request('/settings/email/send', {
    method: 'POST',
    body: JSON.stringify({ trigger, to, name, link, customerId, formName }),
  });
}
export function listEmailTemplates(): Promise<EmailTemplate[]> {
  return request('/settings/email-templates');
}
export function saveEmailTemplate(
  trigger: EmailTrigger,
  patch: { name: string; subject: string; body: string; label?: string },
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
export function setFormVisible(id: string, customerVisible: boolean): Promise<FormRecord> {
  return request(`/forms/${id}`, { method: 'PATCH', body: JSON.stringify({ customerVisible }) });
}
export function deleteForm(id: string): Promise<void> {
  return request(`/forms/${id}`, { method: 'DELETE' });
}

// --- form submissions ---
export interface CreateFormSubmissionInput {
  form: string;
  customer?: string;
  // 0/omitted: a plain, general-purpose link. 1: tied to that one pet
  // (FormSubmissionRecord.animal). 2+: one merged link covering all of them
  // (FormSubmissionRecord.animals) -- see backend's FormSubmissionsService.create().
  animals?: string[];
  recipientEmail: string;
  recipientName?: string;
  // Opening a booking's check-in/check-out to fill in: the backend hands
  // back that booking's still-pending one for this stage if there is one,
  // instead of creating another.
  forBooking?: string;
  bookingStage?: 'checkIn' | 'checkOut';
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
export function sendFormSubmissionCopy(id: string, attachmentData: string, attachmentName: string): Promise<void> {
  return request(`/form-submissions/${id}/send-copy`, {
    method: 'POST',
    body: JSON.stringify({ attachmentData, attachmentName }),
  });
}
// Public endpoints, same ones the customer-facing intake app's FormFillPage
// uses to fill a pre-check-in link -- reused here for the new staff-facing
// FormFillModal (check-in/check-out), since @Public() just skips the auth
// check, it doesn't refuse an authenticated caller.
export function fetchFormSubmissionPublic(id: string): Promise<FormSubmissionPublic> {
  return request(`/form-submissions/${id}/public`);
}
export function submitFormSubmission(id: string, answers: Record<string, unknown>): Promise<void> {
  return request(`/form-submissions/${id}/submit`, { method: 'POST', body: JSON.stringify({ answers }) });
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

// --- notifications: feed (admin bell) + global settings ---
export interface NotificationItem {
  _id: string;
  title: string;
  body: string;
  type?: string;
  read: boolean;
  createdAt: string;
}
export function listNotifications(): Promise<NotificationItem[]> {
  return request('/notifications');
}
export function notificationsUnreadCount(): Promise<{ count: number }> {
  return request('/notifications/unread-count');
}
export function markNotificationsRead(): Promise<{ ok: boolean }> {
  return request('/notifications/mark-read', { method: 'POST' });
}
export function clearNotifications(): Promise<{ ok: boolean }> {
  return request('/notifications', { method: 'DELETE' });
}

export interface NotificationSettings {
  customerActivated: boolean;
  customerUpdated: boolean;
  customerPetUpdated: boolean;
  formSubmitted: boolean;
  preCheckInCompleted: boolean;
  appointmentReminders: boolean;
  appointmentLeadMinutes: number;
  dailyDigest: boolean;
  dailyDigestTime: string;
  invoicesOverdue: boolean;
  invoicesRead: boolean;
  checklistReminders: boolean;
}
export function getNotificationSettings(): Promise<NotificationSettings> {
  return request('/settings/notifications');
}
export function updateNotificationSettings(patch: Partial<NotificationSettings>): Promise<NotificationSettings> {
  return request('/settings/notifications', { method: 'PATCH', body: JSON.stringify(patch) });
}

// --- checklists (Settings > Boarding, and Boarding & DayCare > Checklists) ---
export function listChecklistTemplates(): Promise<ChecklistTemplate[]> {
  return request('/checklist-templates');
}
export interface ChecklistTemplateInput {
  category: ChecklistCategory;
  name: string;
  completeByTime?: string;
  items: string[];
  autoAssign?: boolean;
  session?: ChecklistSession;
}
export function createChecklistTemplate(input: ChecklistTemplateInput): Promise<ChecklistTemplate> {
  return request('/checklist-templates', { method: 'POST', body: JSON.stringify(input) });
}
export function updateChecklistTemplate(id: string, input: ChecklistTemplateInput): Promise<ChecklistTemplate> {
  return request(`/checklist-templates/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
// Adds auto-assign checklists to days already booked from `from` onwards.
export function syncChecklists(from: string): Promise<{ bookings: number }> {
  return request(`/day-bookings/sync-checklists?from=${from}`, { method: 'POST' });
}
export function deleteChecklistTemplate(id: string): Promise<void> {
  return request(`/checklist-templates/${id}`, { method: 'DELETE' });
}
export function listChecklistAssignments(from: string, to: string): Promise<ChecklistAssignment[]> {
  return request(`/checklist-assignments?from=${from}&to=${to}`);
}
export function listCompletedChecklistAssignments(
  page: number,
  limit = 10,
): Promise<{ items: ChecklistAssignment[]; total: number; page: number; limit: number }> {
  return request(`/checklist-assignments/completed?page=${page}&limit=${limit}`);
}
export function assignChecklist(input: { template: string; date: string }): Promise<ChecklistAssignment> {
  return request('/checklist-assignments', { method: 'POST', body: JSON.stringify(input) });
}
export function toggleChecklistItem(id: string, index: number): Promise<ChecklistAssignment> {
  return request(`/checklist-assignments/${id}/items/${index}`, { method: 'PATCH' });
}
export function updateChecklistAssignment(
  id: string,
  input: { notes?: string; signatureImage?: string; signedAt?: string },
): Promise<ChecklistAssignment> {
  return request(`/checklist-assignments/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteChecklistAssignment(id: string): Promise<void> {
  return request(`/checklist-assignments/${id}`, { method: 'DELETE' });
}

export function listRiskAssessments(): Promise<RiskAssessment[]> {
  return request('/risk-assessments');
}
export function getRiskAssessment(id: string): Promise<RiskAssessment> {
  return request(`/risk-assessments/${id}`);
}
export function createRiskAssessment(input: {
  name: string;
  regulationReference?: string;
  reviewFrequency?: string;
  scope?: string;
  status?: string;
}): Promise<RiskAssessment> {
  return request('/risk-assessments', { method: 'POST', body: JSON.stringify(input) });
}
export function updateRiskAssessment(
  id: string,
  input: Partial<{
    name: string;
    regulationReference: string;
    reviewFrequency: string;
    scope: string;
    status: string;
  }>,
): Promise<RiskAssessment> {
  return request(`/risk-assessments/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteRiskAssessment(id: string): Promise<void> {
  return request(`/risk-assessments/${id}`, { method: 'DELETE' });
}
export function reviewRiskAssessmentPolicy(id: string): Promise<RiskAssessment> {
  return request(`/risk-assessments/${id}/review`, { method: 'POST' });
}
export interface RiskItemInput {
  hazard: string;
  whoAtRisk?: string;
  existingControls?: string[];
  furtherActions?: string[];
  likelihood: number;
  severity: number;
  residualRisk: string;
  reviewPeriod?: string;
}
export function addRiskItem(assessmentId: string, input: RiskItemInput): Promise<RiskAssessment> {
  return request(`/risk-assessments/${assessmentId}/risks`, { method: 'POST', body: JSON.stringify(input) });
}
export function updateRiskItem(
  assessmentId: string,
  riskId: string,
  input: Partial<RiskItemInput>,
): Promise<RiskAssessment> {
  return request(`/risk-assessments/${assessmentId}/risks/${riskId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
export function deleteRiskItem(assessmentId: string, riskId: string): Promise<RiskAssessment> {
  return request(`/risk-assessments/${assessmentId}/risks/${riskId}`, { method: 'DELETE' });
}
export function previewRiskAssessmentImport(file: string, fileName: string): Promise<ImportedRiskAssessmentDraft> {
  return request('/risk-assessments/import/preview', { method: 'POST', body: JSON.stringify({ file, fileName }) });
}
export function importRiskAssessment(input: {
  name: string;
  regulationReference?: string;
  reviewFrequency?: string;
  scope?: string;
  assessmentDate?: string;
  nextReviewDate?: string;
  assessedBy?: string;
  fileName?: string;
  risks: RiskItemInput[];
}): Promise<RiskAssessment> {
  return request('/risk-assessments/import', { method: 'POST', body: JSON.stringify(input) });
}
export function sendRiskAssessmentEmail(id: string, email: string): Promise<RiskAssessment> {
  return request(`/risk-assessments/${id}/send-email`, { method: 'POST', body: JSON.stringify({ email }) });
}

export function listPolicies(): Promise<Policy[]> {
  return request('/policies');
}
export function getPolicy(id: string): Promise<Policy> {
  return request(`/policies/${id}`);
}
export function listPolicyStaffOptions(): Promise<{ _id: string; name: string }[]> {
  return request('/policies/staff');
}
export interface CreatePolicyInput {
  name: string;
  category?: string;
  reference?: string;
  reviewFrequency?: string;
  content: string;
  changeSummary?: string;
  status?: string;
  signOffStaffIds?: string[];
}
export function createPolicy(input: CreatePolicyInput): Promise<Policy> {
  return request('/policies', { method: 'POST', body: JSON.stringify(input) });
}
export function updatePolicy(
  id: string,
  input: Partial<{ name: string; category: string; reference: string; reviewFrequency: string; status: string }>,
): Promise<Policy> {
  return request(`/policies/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deletePolicy(id: string): Promise<void> {
  return request(`/policies/${id}`, { method: 'DELETE' });
}
export function publishPolicyVersion(
  id: string,
  input: { content: string; changeSummary?: string; signOffStaffIds?: string[] },
): Promise<Policy> {
  return request(`/policies/${id}/versions`, { method: 'POST', body: JSON.stringify(input) });
}
export function signOffPolicy(id: string, signedName: string): Promise<Policy> {
  return request(`/policies/${id}/sign`, { method: 'POST', body: JSON.stringify({ signedName }) });
}
export function sendPolicyReminder(id: string): Promise<Policy> {
  return request(`/policies/${id}/remind`, { method: 'POST' });
}
export function resetPolicyToV1(id: string): Promise<Policy> {
  return request(`/policies/${id}/reset-to-v1`, { method: 'POST' });
}
export function sendPolicyEmail(id: string, email: string): Promise<Policy> {
  return request(`/policies/${id}/send-email`, { method: 'POST', body: JSON.stringify({ email }) });
}
export function assignPolicyUsers(id: string, staffIds: string[]): Promise<Policy> {
  return request(`/policies/${id}/assign-users`, { method: 'PATCH', body: JSON.stringify({ staffIds }) });
}

// --- Staff Training (Training Admin) ---

export function listTrainingModules(): Promise<TrainingModule[]> {
  return request('/training/modules');
}
export function getTrainingModule(id: string): Promise<TrainingModule> {
  return request(`/training/modules/${id}`);
}
export interface TrainingModuleInput {
  name: string;
  description?: string;
  status: TrainingModule['status'];
  contentBlocks: Omit<TrainingModule['contentBlocks'][number], '_id'>[];
  questionBank: Omit<TrainingModule['questionBank'][number], '_id'>[];
  passMarkPercent: number;
  questionsPerAttempt: number;
  reviewFrequency?: string;
  dueWithinDays: number;
}
export function createTrainingModule(input: TrainingModuleInput): Promise<TrainingModule> {
  return request('/training/modules', { method: 'POST', body: JSON.stringify(input) });
}
export function updateTrainingModule(id: string, input: TrainingModuleInput): Promise<TrainingModule> {
  return request(`/training/modules/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}
export function deleteTrainingModule(id: string): Promise<void> {
  return request(`/training/modules/${id}`, { method: 'DELETE' });
}
export function listTrainingStaffOptions(): Promise<{ _id: string; name: string }[]> {
  return request('/training/modules/staff');
}
export function assignTrainingModuleUsers(id: string, staffIds: string[]): Promise<TrainingModule> {
  return request(`/training/modules/${id}/assign-users`, { method: 'PATCH', body: JSON.stringify({ staffIds }) });
}
export function setTrainingModuleAssignAll(id: string, enabled: boolean): Promise<TrainingModule> {
  return request(`/training/modules/${id}/assign-all`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
}
export function getTrainingCompliance(): Promise<TrainingComplianceRow[]> {
  return request('/training/modules/compliance');
}
export function getTrainingAttemptHistory(moduleId: string, staffId?: string): Promise<TrainingAttempt[]> {
  const query = staffId ? `?staffId=${encodeURIComponent(staffId)}` : '';
  return request(`/training/modules/${moduleId}/attempts${query}`);
}
export function trainingContentFileUrl(moduleId: string, blockId: string): string {
  return `${API_URL}/training/modules/${moduleId}/content/${blockId}/file`;
}
// Bypasses the shared `request` helper, which assumes a JSON response body --
// this one is a binary file, same reasoning as downloadTermsFile().
export async function getTrainingContentFile(moduleId: string, blockId: string): Promise<Blob> {
  const res = await fetch(trainingContentFileUrl(moduleId, blockId), {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  });
  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return res.blob();
}

export function listMyTraining(): Promise<MyTrainingListEntry[]> {
  return request('/training/my');
}
export function getMyTrainingModule(id: string): Promise<MyTrainingListEntry> {
  return request(`/training/my/${id}`);
}
export function startTrainingAttempt(moduleId: string): Promise<StartAttemptResult> {
  return request(`/training/my/${moduleId}/start`, { method: 'POST' });
}
export function submitTrainingAttempt(attemptId: string, answers: number[]): Promise<SubmitAttemptResult> {
  return request(`/training/my/attempts/${attemptId}/submit`, { method: 'POST', body: JSON.stringify({ answers }) });
}

// --- pre-boarding ---
export function getPreBoardingSettings(): Promise<PreBoardingSettings> {
  return request('/pre-boarding/settings');
}
export function updatePreBoardingSettings(patch: {
  maxScore?: number;
  questions?: PreBoardingQuestion[];
}): Promise<PreBoardingSettings> {
  return request('/pre-boarding/settings', { method: 'PUT', body: JSON.stringify(patch) });
}
export function resetPreBoardingQuestions(): Promise<PreBoardingSettings> {
  return request('/pre-boarding/settings/reset-questions', { method: 'POST' });
}
export function listPreBoardingForms(): Promise<PreBoardingFormRecord[]> {
  return request('/pre-boarding');
}
export function getPreBoardingForm(id: string): Promise<PreBoardingFormRecord> {
  return request(`/pre-boarding/${id}`);
}
export function createPreBoardingForm(input: {
  firstName: string;
  surname?: string;
  email: string;
  dogCount: number;
}): Promise<PreBoardingFormRecord> {
  return request('/pre-boarding', { method: 'POST', body: JSON.stringify(input) });
}
export function sendPreBoardingForm(id: string): Promise<void> {
  return request(`/pre-boarding/${id}/send`, { method: 'POST' });
}
export function deletePreBoardingForm(id: string): Promise<void> {
  return request(`/pre-boarding/${id}`, { method: 'DELETE' });
}

// Settings > Recycle Bin -- see backend/src/recycle-bin/.
export interface RecycleBinEntry {
  id: string;
  deletedAt: string;
  deletedBy: string;
  typeLabel: string;
  label: string;
  customerName?: string | null;
  itemCount: number;
  alsoIncludes: string;
}

export function listRecycleBin(): Promise<RecycleBinEntry[]> {
  return request('/recycle-bin');
}

export function restoreRecycleBinEntry(id: string): Promise<{ restored: number }> {
  return request(`/recycle-bin/${id}/restore`, { method: 'POST' });
}

export function purgeRecycleBinEntry(id: string): Promise<void> {
  return request(`/recycle-bin/${id}`, { method: 'DELETE' });
}

export function emptyRecycleBin(): Promise<{ deleted: number }> {
  return request('/recycle-bin', { method: 'DELETE' });
}
