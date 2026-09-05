// The {{token}} placeholders a form field's label (or a "Free text" field's
// whole body) can use -- resolved server-side, at the point a specific
// customer's link is opened, against that customer's own record (see
// backend/src/forms/form-placeholders.util.ts). Kept in sync by hand with
// the backend's FORM_PLACEHOLDERS, same convention as email templates'
// TRIGGER_PLACEHOLDERS/admin/src/pages/SettingsPage.tsx already use.
//
// Only resolves once a submission is tied to a known customer -- sending a
// form to a brand-new lead (typed name/email, no customer picked) leaves
// every token blank and any "customer's pets" dropdown empty.
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
