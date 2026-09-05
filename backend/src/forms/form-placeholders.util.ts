import { Customer } from '../customers/schemas/customer.schema';

// The set of {{token}} placeholders available to a form's field labels/free
// text once a submission is tied to a real customer (SendFormModal already
// captures `customer` on CreateFormSubmissionDto whenever staff pick one from
// the list) -- kept in sync by hand with the admin copy
// (admin/src/utils/formPlaceholders.ts), same convention as the email
// templates' TRIGGER_PLACEHOLDERS/admin/src/utils/emailTemplate.ts pair.
export const FORM_PLACEHOLDERS: { key: string; hint: string }[] = [
  { key: 'customerName', hint: "Customer's full name" },
  { key: 'firstName', hint: "Customer's first name" },
  { key: 'surname', hint: "Customer's surname" },
  { key: 'email', hint: "Customer's email address" },
  { key: 'phone', hint: "Customer's phone number" },
  { key: 'address', hint: "Customer's full address" },
  { key: 'postcode', hint: "Customer's postcode" },
  { key: 'petNames', hint: "All the customer's pet names, comma-separated" },
];

// Only ever built for a submission with a known, real customer -- a
// brand-new lead (no `customer` set yet) has nothing to substitute, so
// FormSubmissionsService.findOnePublic() just omits this entirely rather
// than calling in with an empty Customer.
export function buildCustomerPlaceholders(
  customer: Customer,
  petNames: string[],
): Record<string, string> {
  return {
    customerName: customer.name ?? '',
    firstName: customer.firstName ?? '',
    surname: customer.surname ?? '',
    email: customer.email ?? '',
    phone: customer.phoneNumber ?? '',
    address: customer.address ?? '',
    postcode: customer.postcode ?? '',
    petNames: petNames.join(', '),
  };
}

// Substitutes every {{token}} in `text` from `vars`, leaving an unknown token
// as an empty string -- same simple (no {{#if}} conditionals) approach as
// the intake form's own {{petName}} substitution in off-lead consent text,
// since a form field's label is plain text, not an email body.
export function interpolatePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}
