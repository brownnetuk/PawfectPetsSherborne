import type { jsPDF } from 'jspdf';
import {
  BrandPdfWriter,
  fieldRowBlock,
  listBlock,
  loadContactLine,
  paragraphBlock,
  signatureBlock,
  spacerBlock,
  subheadingBlock,
  type Block,
} from './brandPdf';
import type { Animal, Customer } from '../types';

// Fallback only -- used when no terms have been uploaded in Settings > Business
// Info (see htmlToBlocks below for the normal path). Mirrors the fallback text
// in frontend/src/intake/steps/AgreementStep.tsx, kept in sync manually since
// the two apps don't share code.
const TERMS = [
  "The client confirms all information provided in this form is accurate and will notify PawfectPets Sherborne promptly of any changes to contact, veterinary, or pet health details.",
  "The client authorises PawfectPets Sherborne to make decisions regarding the animal's welfare in an emergency, including obtaining veterinary treatment as set out in the Emergency Vet section of this form.",
  'The client is responsible for ensuring vaccinations, flea, and worming treatment are up to date for the duration of any care provided.',
  'PawfectPets Sherborne will take all reasonable care of the animal but cannot be held liable for illness, injury, loss, or death outside of its direct negligence.',
  'Where off-lead exercise has been consented to, the client accepts this is undertaken at their own risk as described in the Off-Lead Consent section.',
  'Any keys or security information (e.g. alarm codes) provided will be stored securely and used solely for the purpose of delivering the agreed service.',
  'Fees are payable as agreed at time of booking. PawfectPets Sherborne reserves the right to decline or discontinue a booking where an animal poses a safety risk not disclosed in this form.',
  'This agreement remains in effect for all future bookings unless the client notifies PawfectPets Sherborne of a change in circumstances.',
];

// Fallback only -- used when Settings > Business Info has never had this
// field set. Mirrors the default in backend/src/settings/settings.service.ts
// and the frontend's own copy in frontend/src/intake/steps/EmergencyVetStep.tsx.
const DEFAULT_VET_AUTHORISATION_TEXT =
  'I authorise PawfectPets Sherborne to arrange alternative veterinary care for my pet if my usual vet is unobtainable in an emergency.';

// Same idea, for the Client agreement section's Declaration text.
const DEFAULT_DECLARATION_TEXT =
  'I confirm that the information provided in this form is accurate and complete to the best of my knowledge, and I agree to be bound by the terms set out above.';

// Same idea, for Off-lead consent -- {{petName}} is substituted with the
// actual pet's name below.
const DEFAULT_OFF_LEAD_CONSENT_TEXT =
  'I consent to {{petName}} being exercised off the lead, and understand this is at my own risk.';

// Wide enough for the longest label actually used ("Alternative care
// authorisation") plus a gap before the value column -- a fixed column keeps
// every field's value aligned, but it has to be sized to the longest label
// or long ones overrun into the value.
const FIELD_LABEL_WIDTH = 150;

function medicationSummary(medication: Animal['medication']): string {
  if (!medication.onMedication) return 'No';
  if (medication.medications && medication.medications.length > 0) {
    return medication.medications
      .map((m) => {
        const parts = [m.name, m.illnessTreating, m.dosage, m.frequency].filter(Boolean).join(', ');
        const flags = `Vet prescribed: ${m.vetPrescribed ? 'Yes' : 'No'}; Pawfect Pets to administer: ${m.administeredByPawfectPets ? 'Yes' : 'No'}`;
        return [parts, flags, m.additionalInfo].filter(Boolean).join(' — ');
      })
      .join('\n');
  }
  return `Yes — ${medication.details ?? ''}`;
}

function formatNeuteredStatus(animal: Animal): string {
  if (animal.neuteredStatus === 'neutered') return 'Neutered (Boy)';
  if (animal.neuteredStatus === 'spayed') return 'Spayed (Girl)';
  // Only an intact female can have a "last season" -- a spayed dog doesn't
  // have seasons.
  return animal.lastSeasonEndDate
    ? `No — last season ended ${new Date(animal.lastSeasonEndDate).toLocaleDateString('en-GB')}`
    : 'No';
}

function fieldBlock(doc: jsPDF, label: string, value: string): Block {
  return fieldRowBlock(doc, label, value, FIELD_LABEL_WIDTH);
}

function numberedListBlock(doc: jsPDF, items: string[]): Block {
  return listBlock(doc, items, true);
}

function bulletListBlock(doc: jsPDF, items: string[]): Block {
  return listBlock(doc, items, false);
}

/**
 * Converts the HTML mammoth produces from an uploaded terms .docx (Settings >
 * Business Info) into PDF blocks -- headings, paragraphs, and (numbered or
 * bulleted) lists, using each element's plain textContent rather than
 * attempting to preserve inline bold/italic runs. Good enough for the
 * heading/paragraph/list shape a Word terms document actually has; anything
 * unrecognised (e.g. a table) still renders as a plain paragraph rather than
 * being silently dropped.
 */
function htmlToBlocks(doc: jsPDF, html: string): Block[] {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const blocks: Block[] = [];
  for (const el of Array.from(parsed.body.children)) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(el.children)
        .filter((li) => li.tagName.toLowerCase() === 'li')
        .map((li) => (li.textContent ?? '').trim())
        .filter(Boolean);
      if (items.length > 0) {
        blocks.push(tag === 'ol' ? numberedListBlock(doc, items) : bulletListBlock(doc, items));
      }
      continue;
    }
    const text = (el.textContent ?? '').trim();
    if (!text) continue;
    blocks.push(/^h[1-6]$/.test(tag) ? subheadingBlock(doc, text) : paragraphBlock(doc, text));
  }
  return blocks;
}

function yesNo(v: boolean): string {
  return v ? 'Yes' : 'No';
}

export async function buildCustomerFormPdf(
  customer: Customer,
  animals: Animal[],
  alarmInstructions: string | null,
  termsHtml?: string,
  emergencyVetAuthorisationText?: string,
  offLeadConsentText?: string,
  declarationText?: string,
): Promise<jsPDF> {
  const w = new BrandPdfWriter();
  const [, contact] = await Promise.all([w.init(), loadContactLine()]);
  const doc = w.doc;

  w.drawHeader({
    title: 'Registration form',
    subtitle: `for ${customer.name}`,
    badge: customer.agreement?.signedAt
      ? { label: 'Signed', value: new Date(customer.agreement.signedAt).toLocaleDateString('en-GB') }
      : undefined,
  });

  w.section('Client details', [
    fieldBlock(doc, 'Name', customer.name),
    fieldBlock(doc, 'Email', customer.email),
    fieldBlock(doc, 'Phone number', customer.phoneNumber ?? ''),
    fieldBlock(doc, 'Address', customer.address ?? ''),
  ]);

  const ec = customer.emergencyContact;
  w.section(
    'Emergency contact',
    ec?.sameAsClient
      ? [fieldBlock(doc, 'Contact', 'Same as client')]
      : [
          fieldBlock(doc, 'Name', ec?.name ?? ''),
          fieldBlock(doc, 'Address', ec?.address ?? ''),
          fieldBlock(doc, 'Phone number', ec?.phoneNumber ?? ''),
          fieldBlock(doc, 'Email', ec?.email ?? ''),
        ],
  );

  const ev = customer.emergencyVet;
  const evBlocks: Block[] = [
    fieldBlock(doc, 'Practice', ev?.practiceName ?? ''),
    fieldBlock(doc, 'Address', ev?.address ?? ''),
    fieldBlock(doc, 'Telephone', ev?.telephone ?? ''),
    fieldBlock(doc, 'Email', ev?.email ?? ''),
    fieldBlock(
      doc,
      'Alternative care authorisation',
      ev?.authorisation?.signedName
        ? `Signed by ${ev.authorisation.signedName}${
            ev.authorisation.signedAt
              ? ` on ${new Date(ev.authorisation.signedAt).toLocaleDateString('en-GB')}`
              : ''
          }`
        : 'Not signed',
    ),
  ];
  if (ev?.authorisation?.signedName) {
    evBlocks.push(
      paragraphBlock(doc, emergencyVetAuthorisationText || DEFAULT_VET_AUTHORISATION_TEXT),
    );
  }
  if (ev?.authorisation?.signatureImage) {
    evBlocks.push(spacerBlock(4));
    evBlocks.push(signatureBlock(ev.authorisation.signatureImage, 'Alternative vet care authorisation signature'));
  }
  w.section('Emergency vet', evBlocks);

  w.section('Security arrangements', [
    fieldBlock(doc, 'Keys provided', customer.security ? yesNo(customer.security.keysProvided) : '—'),
    fieldBlock(doc, 'Alarm/KeySafe Code', alarmInstructions || '(none provided)'),
    fieldBlock(doc, 'Further information', customer.security?.furtherInformation ?? ''),
  ]);

  for (const animal of animals) {
    const blocks: Block[] = [
      fieldBlock(doc, 'Species', animal.species),
      fieldBlock(doc, 'Breed', animal.breed),
      fieldBlock(doc, 'Sex', animal.sex),
      fieldBlock(doc, 'Age', String(animal.age)),
      fieldBlock(
        doc,
        'Date of birth',
        animal.dateOfBirth ? new Date(animal.dateOfBirth).toLocaleDateString('en-GB') : '',
      ),
      fieldBlock(
        doc,
        'Vaccinated',
        animal.vaccinated
          ? `Yes (expires ${animal.vaccineExpiryDate ? new Date(animal.vaccineExpiryDate).toLocaleDateString('en-GB') : 'unknown'})`
          : 'No',
      ),
      fieldBlock(doc, 'Colour / markings', animal.colourMarkings ?? ''),
      fieldBlock(doc, 'Microchip number', animal.microchipNumber ?? ''),
      fieldBlock(doc, 'Insured', animal.insured ? `Yes — ${animal.insurer ?? ''}` : 'No'),
      fieldBlock(doc, 'Spayed/Neutered', formatNeuteredStatus(animal)),
      fieldBlock(doc, 'Temperament notes', animal.temperamentNotes ?? ''),
      fieldBlock(
        doc,
        'Aggression to people',
        animal.aggressionToPeople ? `Yes — ${animal.aggressionToPeopleDetails ?? ''}` : 'No',
      ),
    ];
    if (animal.species !== 'cat') {
      blocks.push(
        fieldBlock(
          doc,
          'Aggression to other animals',
          animal.aggressionToOtherAnimals ? `Yes — ${animal.aggressionToOtherAnimalsDetails ?? ''}` : 'No',
        ),
      );
      blocks.push(
        fieldBlock(
          doc,
          'Travels well in car',
          animal.travelsWellInCar === 'no'
            ? `No — ${animal.travelsWellInCarDetails ?? ''}`
            : animal.travelsWellInCar ?? '',
        ),
      );
    }
    if (animal.species === 'dog') {
      blocks.push(
        fieldBlock(
          doc,
          'Chases livestock',
          animal.chasesLivestock === 'yes'
            ? `Yes — ${animal.chasesLivestockDetails ?? ''}`
            : animal.chasesLivestock ?? '',
        ),
      );
    }
    blocks.push(
      fieldBlock(
        doc,
        'Allergies',
        animal.allergies.status === 'no' ? 'No' : `${animal.allergies.status} — ${animal.allergies.details ?? ''}`,
      ),
      fieldBlock(doc, 'On medication', medicationSummary(animal.medication)),
    );

    if (animal.species === 'dog' && animal.offLeadConsent) {
      blocks.push(spacerBlock(6));
      blocks.push(subheadingBlock(doc, 'Off-lead consent'));
      blocks.push(fieldBlock(doc, 'Lead', animal.offLeadConsent.mode === 'off_lead' ? 'Off lead' : 'On lead'));
      if (animal.offLeadConsent.mode === 'off_lead') {
        blocks.push(
          paragraphBlock(
            doc,
            (offLeadConsentText || DEFAULT_OFF_LEAD_CONSENT_TEXT).replaceAll('{{petName}}', animal.name),
          ),
        );
        if (animal.offLeadConsent.signature) {
          blocks.push(signatureBlock(animal.offLeadConsent.signature, `Off-lead consent signature — ${animal.name}`));
        }
      }
    }

    w.section(`Pet — ${animal.name}`, blocks);
  }

  const termsBlocks = termsHtml ? htmlToBlocks(doc, termsHtml) : [];
  w.startNewPage();
  w.section('Terms & conditions', termsBlocks.length > 0 ? termsBlocks : [numberedListBlock(doc, TERMS)], { card: false });

  const agreementBlocks: Block[] = [];
  if (customer.agreement?.signedName) {
    agreementBlocks.push(paragraphBlock(doc, declarationText || DEFAULT_DECLARATION_TEXT));
  }
  agreementBlocks.push(
    fieldBlock(doc, 'Signed by', customer.agreement?.signedName ?? ''),
    fieldBlock(
      doc,
      'Signed at',
      customer.agreement?.signedAt ? new Date(customer.agreement.signedAt).toLocaleString('en-GB') : '',
    ),
  );
  if (customer.agreement?.signatureImage) {
    agreementBlocks.push(spacerBlock(4));
    agreementBlocks.push(signatureBlock(customer.agreement.signatureImage, 'Client signature'));
  }
  w.section('Client agreement', agreementBlocks);

  w.finish(contact);

  return w.doc;
}
