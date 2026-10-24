// Display names for the Recycle Bin list -- what kind of record each one is
// ("Pet", "Payment") and a short name for it ("Bella", "INV-0042",
// "£45.00 payment"). Model names not listed here fall back to splitting the
// class name ("BankHoliday" -> "Bank holiday"), so a newly added model still
// shows something sensible without needing an entry.
const TYPE_LABELS: Record<string, string> = {
  Animal: 'Pet',
  CrmActivity: 'Customer note',
  FormSubmission: 'Form',
  BookingObservation: 'Observation',
  Staff: 'Staff account',
  PushMessage: 'Push message',
  EmailMessage: 'Email',
  OtherIncome: 'Other income',
  ChecklistTemplate: 'Checklist',
  ChecklistAssignment: 'Checklist (assigned)',
  PreBoardingForm: 'Pre-boarding form',
  TrainingModule: 'Training module',
  TrainingAttempt: 'Training attempt',
  AuditLogEntry: 'Activity log entry',
  EmailTemplate: 'Email template',
};

export function typeLabel(modelName: string): string {
  if (TYPE_LABELS[modelName]) return TYPE_LABELS[modelName];
  const words = modelName.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type RawDoc = Record<string, unknown>;

function money(v: unknown): string | undefined {
  return typeof v === 'number' ? `£${v.toFixed(2)}` : undefined;
}

function ukDate(v: unknown): string | undefined {
  if (!(v instanceof Date) || isNaN(v.getTime())) return undefined;
  return v.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/London',
  });
}

function text(v: unknown, max = 60): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const s = v
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function describeRecord(modelName: string, doc: RawDoc): string {
  switch (modelName) {
    case 'Payment':
      return [money(doc.amount), 'payment', text(doc.paymentId)]
        .filter(Boolean)
        .join(' ');
    case 'Expense':
      return [
        money(doc.amount),
        text(doc.payee) ?? text(doc.description) ?? text(doc.category),
        ukDate(doc.date),
      ]
        .filter(Boolean)
        .join(' · ');
    case 'OtherIncome':
    case 'BankTransfer':
      return [
        money(doc.amount),
        text(doc.description) ?? text(doc.reference),
        ukDate(doc.date),
      ]
        .filter(Boolean)
        .join(' · ');
    case 'CreditNote':
      return [text(doc.creditNoteNumber), money(doc.amount)]
        .filter(Boolean)
        .join(' · ');
    case 'Booking':
      return [text(doc.serviceType), ukDate(doc.startDate)]
        .filter(Boolean)
        .join(' · ');
    case 'DayBooking':
    case 'Appointment':
      return ukDate(doc.date) ?? 'Calendar entry';
    case 'Message':
      return text(doc.body) ?? 'Message';
    case 'InvoiceTerm':
      return text(doc.text) ?? 'Invoice term';
    case 'EmailTemplate':
      return text(doc.name) ?? text(doc.trigger) ?? 'Email template';
    case 'PreBoardingForm':
      return (
        [text(doc.firstName), text(doc.surname)].filter(Boolean).join(' ') +
          (Array.isArray(doc.dogNames) && doc.dogNames.length
            ? ` (${doc.dogNames.join(', ')})`
            : '') ||
        (text(doc.email) ?? 'Pre-boarding form')
      );
  }
  for (const key of [
    'name',
    'invoiceNumber',
    'quoteNumber',
    'creditNoteNumber',
    'reference',
    'raId',
    'formName',
    'practiceName',
    'subject',
    'title',
    'category',
    'description',
  ]) {
    const value = text(doc[key]);
    if (value) return value;
  }
  return ukDate(doc.date) ?? ukDate(doc.createdAt) ?? String(doc._id);
}
