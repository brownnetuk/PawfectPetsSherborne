import { diffFields, DiffFieldSpec, formatCapitalised, formatDate } from '../common/field-diff.util';
import type { UpdateAnimalDto } from './dto/update-animal.dto';
import type { Animal } from './schemas/animal.schema';

function formatNeuteredStatus(v: unknown): string {
  if (v === 'neutered') return 'Neutered (Boy)';
  if (v === 'spayed') return 'Spayed (Girl)';
  if (v === 'no') return 'No';
  return '—';
}

function formatLeadMode(v: unknown): string {
  if (v === 'off_lead') return 'Off lead';
  if (v === 'on_lead') return 'On lead';
  return '—';
}

// Excludes photos (has its own dedicated "N photo(s) added/removed" summary
// -- see describePhotoChange in animals.service.ts) and
// offLeadConsent.signature (a signature image, not something to dump as
// plain text -- offLeadConsent.mode itself is still diffed below).
const ANIMAL_FIELDS: DiffFieldSpec[] = [
  { path: 'species', label: 'Type' },
  { path: 'breed', label: 'Breed' },
  { path: 'name', label: 'Name' },
  { path: 'sex', label: 'Sex', format: formatCapitalised },
  { path: 'age', label: 'Age' },
  { path: 'dateOfBirth', label: 'Date of birth', format: formatDate },
  { path: 'vaccinated', label: 'Vaccinated' },
  { path: 'vaccineExpiryDate', label: 'Vaccine expiry date', format: formatDate },
  { path: 'colourMarkings', label: 'Colour / markings' },
  { path: 'microchipNumber', label: 'Microchip number' },
  { path: 'neuteredStatus', label: 'Spayed/Neutered', format: formatNeuteredStatus },
  { path: 'lastSeasonEndDate', label: 'End date of last season', format: formatDate },
  { path: 'temperamentNotes', label: 'Temperament notes' },
  { path: 'aggressionToPeople', label: 'Aggression to people' },
  { path: 'aggressionToPeopleDetails', label: 'Aggression to people: details' },
  { path: 'aggressionToOtherAnimals', label: 'Aggression to other animals' },
  { path: 'aggressionToOtherAnimalsDetails', label: 'Aggression to other animals: details' },
  { path: 'travelsWellInCar', label: 'Travels well in car', format: formatCapitalised },
  { path: 'chasesLivestock', label: 'Chases livestock', format: formatCapitalised },
  { path: 'chasesLivestockDetails', label: 'Chases livestock: details' },
  { path: 'allergies.status', label: 'Allergies / intolerances', format: formatCapitalised },
  { path: 'allergies.details', label: 'Allergy details' },
  { path: 'medication.onMedication', label: 'On medication' },
  { path: 'offLeadConsent.mode', label: 'Off-lead consent', format: formatLeadMode },
];

/**
 * Plain-English, field-by-field "PetName - Label - old > new" summary of a
 * pet update, one per line -- same shape as customers/audit-diff.util.ts's
 * describeCustomerChanges, just with the pet's name on every line since
 * this shows up in the same customer-wide Activity feed as everything else.
 * Returns null when nothing recognisable changed.
 */
export function describeAnimalChanges(
  dto: UpdateAnimalDto,
  before: Animal,
): string | null {
  const patch = dto as unknown as Record<string, unknown>;
  const beforeRecord = before as unknown as Record<string, unknown>;
  const name = before.name;
  const lines = diffFields(patch, beforeRecord, ANIMAL_FIELDS).map(
    (c) => `${name} - ${c.label} - ${c.oldStr} > ${c.newStr}`,
  );

  // Medications are a repeatable list of structured entries -- worth
  // flagging that something changed, but a full per-entry field diff is
  // more than this log needs (matches the existing "not a full recursive
  // diff" scope the rest of this file keeps to).
  const medication = patch.medication as Record<string, unknown> | undefined;
  if (medication && 'medications' in medication) {
    const beforeMeds = JSON.stringify(
      (before.medication as { medications?: unknown[] } | undefined)?.medications ?? [],
    );
    const afterMeds = JSON.stringify(medication.medications ?? []);
    if (beforeMeds !== afterMeds) {
      lines.push(`${name} - Medication details - updated`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}
