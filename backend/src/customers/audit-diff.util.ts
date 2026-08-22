import type { UpdateCustomerDto } from './dto/update-customer.dto';
import type { Customer } from './schemas/customer.schema';

// Scalar fields: only flagged when the incoming value genuinely differs from
// what's stored. Grouped labels (e.g. every name/address part) collapse to
// one entry so "Name" doesn't appear twice for a firstName+surname edit.
const SCALAR_FIELDS: Record<string, string> = {
  firstName: 'Name',
  surname: 'Name',
  address1: 'Address',
  address2: 'Address',
  town: 'Address',
  county: 'Address',
  postcode: 'Address',
  phoneNumber: 'Phone Number',
  email: 'Email',
};

// Object fields: flagged just by being present in the payload at all, not
// value-diffed -- emergencyContact/emergencyVet are nested shapes and
// security's incoming plaintext alarmInstructions has no meaningful
// comparison against the stored ciphertext, so presence is the practical
// signal here, not exact equality.
const PRESENCE_FIELDS: Record<string, string> = {
  emergencyContact: 'Emergency Contact',
  emergencyVet: 'Emergency Vet',
  security: 'Security Arrangements',
};

/**
 * Plain-English summary of which fields changed in a customer update, for
 * the audit log -- not a full recursive diff, just enough to be a useful
 * one-line description. Returns null when nothing recognisable changed
 * (e.g. a no-op PATCH), so the caller can skip logging entirely.
 */
export function describeCustomerChanges(
  dto: UpdateCustomerDto,
  before: Customer,
): string | null {
  const changed = new Set<string>();
  const dtoRecord = dto as unknown as Record<string, unknown>;
  const beforeRecord = before as unknown as Record<string, unknown>;

  for (const [key, label] of Object.entries(SCALAR_FIELDS)) {
    const next = dtoRecord[key];
    if (next !== undefined && next !== beforeRecord[key]) {
      changed.add(label);
    }
  }
  for (const [key, label] of Object.entries(PRESENCE_FIELDS)) {
    if (dtoRecord[key] !== undefined) {
      changed.add(label);
    }
  }

  return changed.size > 0 ? Array.from(changed).join(', ') : null;
}
