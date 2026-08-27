// The full set of permission keys a role can grant -- kept in sync by hand
// with backend/src/auth/permissions.catalog.ts (the backend only needs the
// bare keys, to seed the default "Admin" role; this copy additionally
// carries the label/hint shown in Settings > Staff > Access Permissions).
// Every key here is actually enforced by a @RequirePermission() somewhere in
// the backend -- deliberately not offering "view" permissions yet, since
// none of those are wired up to anything (see the plan/commit history for
// why enforcement was scoped to sensitive operations only).
export interface PermissionCatalogEntry {
  key: string;
  label: string;
  hint: string;
}

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  { key: 'customers.manage', label: 'Delete customers', hint: 'Deleting a customer, their pets, or their activity notes.' },
  { key: 'customers.viewSecurity', label: 'View alarm/keysafe codes', hint: "Viewing a customer's decrypted alarm or keysafe code." },
  { key: 'bookings.manage', label: 'Delete bookings', hint: 'Deleting a booking.' },
  { key: 'invoicing.manage', label: 'Delete invoices & quotes', hint: 'Deleting an invoice or quote.' },
  { key: 'financial.manage', label: 'Delete financial records', hint: 'Deleting a payment, expense, bank account, or credit note.' },
  {
    key: 'settings.manage',
    label: 'Change Settings',
    hint: 'Business info, email connection and templates, invoice/quote config, forms, PDF template, and finance reference data (products, vendors, payment methods, expense categories, invoice terms).',
  },
  {
    key: 'staff.manage',
    label: 'Manage staff & roles',
    hint: 'Creating, editing, or deleting staff accounts and roles, and assigning roles to staff.',
  },
];
