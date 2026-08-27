// The full list of permission keys @RequirePermission() routes can check
// against -- kept in sync by hand with admin/src/utils/permissionCatalog.ts
// (which additionally carries the display label/hint shown in the Access
// Permissions UI; this backend copy only needs the bare keys, to seed the
// default "Admin" role with every permission -- see RolesService.onModuleInit()).
// enquiries.controller.ts's DELETE route deliberately has no key here -- it's
// reused by the routine "Convert to Customer" flow (EnquiriesPage.tsx), not
// just the explicit "Delete enquiry" action, so gating it would block normal
// day-to-day work for any restricted role.
export const ALL_PERMISSION_KEYS = [
  'customers.manage',
  'customers.viewSecurity',
  'bookings.manage',
  'invoicing.manage',
  'financial.manage',
  'settings.manage',
  'staff.manage',
];
