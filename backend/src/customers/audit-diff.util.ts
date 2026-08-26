import { diffFields, DiffFieldSpec } from '../common/field-diff.util';
import type { UpdateCustomerDto } from './dto/update-customer.dto';
import type { Customer } from './schemas/customer.schema';

// Deliberately excludes anything that's a large blob or shouldn't appear as
// plain text in an activity feed: emergencyVet.authorisation's
// signature/signedName (already shown as a signed/not-signed state, with
// the actual image, elsewhere) and agreement's signature (likewise).
// security.alarmInstructions is handled separately below by presence only --
// its old value is only ever available encrypted here, and even if it
// weren't, alarm codes shouldn't show up in a casually-visible log.
const CUSTOMER_FIELDS: DiffFieldSpec[] = [
  { path: 'firstName', label: 'First name' },
  { path: 'surname', label: 'Surname' },
  { path: 'address1', label: 'Address line 1' },
  { path: 'address2', label: 'Address line 2' },
  { path: 'town', label: 'Town' },
  { path: 'county', label: 'County' },
  { path: 'postcode', label: 'Postcode' },
  { path: 'phoneNumber', label: 'Phone number' },
  { path: 'email', label: 'Email' },
  { path: 'emergencyContact.sameAsClient', label: 'Emergency contact: same as client' },
  { path: 'emergencyContact.firstName', label: 'Emergency contact: first name' },
  { path: 'emergencyContact.surname', label: 'Emergency contact: surname' },
  { path: 'emergencyContact.address1', label: 'Emergency contact: address line 1' },
  { path: 'emergencyContact.address2', label: 'Emergency contact: address line 2' },
  { path: 'emergencyContact.town', label: 'Emergency contact: town' },
  { path: 'emergencyContact.county', label: 'Emergency contact: county' },
  { path: 'emergencyContact.postcode', label: 'Emergency contact: postcode' },
  { path: 'emergencyContact.phoneNumber', label: 'Emergency contact: phone number' },
  { path: 'emergencyContact.email', label: 'Emergency contact: email' },
  { path: 'emergencyVet.practiceName', label: 'Emergency vet: practice name' },
  { path: 'emergencyVet.address1', label: 'Emergency vet: address line 1' },
  { path: 'emergencyVet.address2', label: 'Emergency vet: address line 2' },
  { path: 'emergencyVet.town', label: 'Emergency vet: town' },
  { path: 'emergencyVet.county', label: 'Emergency vet: county' },
  { path: 'emergencyVet.postcode', label: 'Emergency vet: postcode' },
  { path: 'emergencyVet.telephone', label: 'Emergency vet: telephone' },
  { path: 'emergencyVet.email', label: 'Emergency vet: email' },
  { path: 'security.keysProvided', label: 'Security: keys provided' },
  { path: 'security.furtherInformation', label: 'Security: further information' },
];

/**
 * Plain-English, field-by-field "Label - old > new" summary of a customer
 * update, one per line, for the audit log. Returns null when nothing
 * recognisable changed (e.g. a no-op PATCH), so the caller can skip logging
 * entirely.
 */
export function describeCustomerChanges(
  dto: UpdateCustomerDto,
  before: Customer,
): string | null {
  const patch = dto as unknown as Record<string, unknown>;
  const beforeRecord = before as unknown as Record<string, unknown>;
  const lines = diffFields(patch, beforeRecord, CUSTOMER_FIELDS).map(
    (c) => `${c.label} - ${c.oldStr} > ${c.newStr}`,
  );

  const security = patch.security as Record<string, unknown> | undefined;
  if (security?.alarmInstructions) {
    lines.push('Security: Alarm/KeySafe Code - updated');
  }

  return lines.length > 0 ? lines.join('\n') : null;
}
