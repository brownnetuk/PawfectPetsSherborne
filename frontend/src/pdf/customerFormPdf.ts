// Adapted from admin/src/pdf/customerFormPdf.ts for this app's own data
// shape -- the two apps don't share code (see that file's own comments),
// and this one builds the PDF from the intake wizard's own in-memory
// IntakeState right at submission time, not a re-fetched Customer/Animal
// record, so it can include the signature/typed-name the customer *just*
// gave (before the server's even responded) and doesn't need a
// server-computed field (name/address/signedAt) it was never given in the
// first place. The drawing primitives come from brandPdf.ts, a copy of admin's;
// only the top-level data gathering differs.
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
import type { AgreementData, IntakeState, MedicationInfo, PetDetails } from '../types';

const DEFAULT_VET_AUTHORISATION_TEXT =
  'I authorise PawfectPets Sherborne to arrange alternative veterinary care for my pet if my usual vet is unobtainable in an emergency.';

// Same idea, for the Client agreement section's Declaration text.
const DEFAULT_DECLARATION_TEXT =
  'I confirm that the information provided in this form is accurate and complete to the best of my knowledge, and I agree to be bound by the terms set out above.';

const DEFAULT_OFF_LEAD_CONSENT_TEXT =
  'I consent to {{petName}} being exercised off the lead, and understand this is at my own risk.';

const DEFAULT_TERMS = [
  'The client confirms all information provided in this form is accurate and will notify PawfectPets Sherborne promptly of any changes to contact, veterinary, or pet health details.',
];



function formatFullName(firstName?: string, surname?: string): string {
  return [firstName, surname].filter(Boolean).join(' ').trim();
}

function formatAddress(parts: {
  address1?: string;
  address2?: string;
  town?: string;
  county?: string;
  postcode?: string;
}): string {
  return [parts.address1, parts.address2, parts.town, parts.county, parts.postcode]
    .filter(Boolean)
    .join('\n');
}

function medicationSummary(medication: MedicationInfo): string {
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

function formatNeuteredStatus(pet: PetDetails): string {
  if (pet.neuteredStatus === 'neutered') return 'Neutered (Boy)';
  if (pet.neuteredStatus === 'spayed') return 'Spayed (Girl)';
  // Only an intact female can have a "last season" -- a spayed dog doesn't
  // have seasons.
  return pet.lastSeasonEndDate
    ? `No — last season ended ${new Date(pet.lastSeasonEndDate).toLocaleDateString('en-GB')}`
    : 'No';
}

const FIELD_LABEL_WIDTH = 150;

function fieldBlock(doc: jsPDF, label: string, value: string): Block {
  return fieldRowBlock(doc, label, value, FIELD_LABEL_WIDTH);
}

function numberedListBlock(doc: jsPDF, items: string[]): Block {
  return listBlock(doc, items, true);
}

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
      if (items.length > 0) blocks.push(numberedListBlock(doc, items));
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

/**
 * Builds a PDF of the intake wizard's state exactly as it's about to be (or
 * was just) submitted -- called right after a successful submit, so the
 * Activity log can attach a true point-in-time snapshot including the
 * signature the customer just drew. `agreement`/`vetSignedAt` default to
 * "now" since the server-assigned timestamp isn't known client-side yet.
 */
export async function buildCustomerFormPdf(
  state: IntakeState,
  termsHtml?: string,
  emergencyVetAuthorisationText?: string,
  offLeadConsentText?: string,
  declarationText?: string,
): Promise<jsPDF> {
  const w = new BrandPdfWriter();
  const [, contact] = await Promise.all([w.init(), loadContactLine()]);
  const doc = w.doc;
  const now = new Date();
  const customerName = formatFullName(state.client.firstName, state.client.surname);

  w.drawHeader({
    title: 'Registration form',
    subtitle: `for ${customerName}`,
    badge: { label: 'Signed', value: now.toLocaleDateString('en-GB') },
  });

  w.section('Client details', [
    fieldBlock(doc, 'Name', customerName),
    fieldBlock(doc, 'Email', state.client.email),
    fieldBlock(doc, 'Phone number', state.client.phoneNumber ?? ''),
    fieldBlock(doc, 'Address', formatAddress(state.client)),
  ]);

  const ec = state.emergencyContact;
  w.section(
    'Emergency contact',
    ec.sameAsClient
      ? [fieldBlock(doc, 'Contact', 'Same as client')]
      : [
          fieldBlock(doc, 'Name', formatFullName(ec.firstName, ec.surname)),
          fieldBlock(doc, 'Address', formatAddress(ec)),
          fieldBlock(doc, 'Phone number', ec.phoneNumber ?? ''),
          fieldBlock(doc, 'Email', ec.email ?? ''),
        ],
  );

  const ev = state.emergencyVet;
  const evBlocks: Block[] = [
    fieldBlock(doc, 'Practice', ev.practiceName ?? ''),
    fieldBlock(doc, 'Address', formatAddress(ev)),
    fieldBlock(doc, 'Telephone', ev.telephone ?? ''),
    fieldBlock(doc, 'Email', ev.email ?? ''),
    fieldBlock(
      doc,
      'Alternative care authorisation',
      ev.authorisation?.signedName
        ? `Signed by ${ev.authorisation.signedName} on ${now.toLocaleDateString('en-GB')}`
        : 'Not signed',
    ),
  ];
  if (ev.authorisation?.signedName) {
    evBlocks.push(paragraphBlock(doc, emergencyVetAuthorisationText || DEFAULT_VET_AUTHORISATION_TEXT));
  }
  if (ev.authorisation?.signatureImage) {
    evBlocks.push(spacerBlock(4));
    evBlocks.push(signatureBlock(ev.authorisation.signatureImage, 'Alternative vet care authorisation signature'));
  }
  w.section('Emergency vet', evBlocks);

  w.section('Security arrangements', [
    fieldBlock(doc, 'Keys provided', yesNo(state.security.keysProvided)),
    fieldBlock(doc, 'Alarm/KeySafe Code', state.security.alarmInstructions || '(none provided)'),
    fieldBlock(doc, 'Further information', state.security.furtherInformation ?? ''),
  ]);

  for (const pet of state.pets) {
    const blocks: Block[] = [
      fieldBlock(doc, 'Species', pet.species),
      fieldBlock(doc, 'Breed', pet.breed),
      fieldBlock(doc, 'Sex', pet.sex),
      fieldBlock(doc, 'Age', pet.age),
      fieldBlock(doc, 'Date of birth', pet.dateOfBirth ? new Date(pet.dateOfBirth).toLocaleDateString('en-GB') : ''),
      fieldBlock(
        doc,
        'Vaccinated',
        pet.vaccinated
          ? `Yes (expires ${pet.vaccineExpiryDate ? new Date(pet.vaccineExpiryDate).toLocaleDateString('en-GB') : 'unknown'})`
          : 'No',
      ),
      fieldBlock(doc, 'Colour / markings', pet.colourMarkings ?? ''),
      fieldBlock(doc, 'Microchip number', pet.microchipNumber ?? ''),
      fieldBlock(doc, 'Insured', pet.insured ? `Yes — ${pet.insurer ?? ''}` : 'No'),
      fieldBlock(doc, 'Spayed/Neutered', formatNeuteredStatus(pet)),
      fieldBlock(doc, 'Temperament notes', pet.temperamentNotes ?? ''),
      fieldBlock(
        doc,
        'Aggression to people',
        pet.aggressionToPeople ? `Yes — ${pet.aggressionToPeopleDetails ?? ''}` : 'No',
      ),
    ];
    if (pet.species !== 'cat') {
      blocks.push(
        fieldBlock(
          doc,
          'Aggression to other animals',
          pet.aggressionToOtherAnimals ? `Yes — ${pet.aggressionToOtherAnimalsDetails ?? ''}` : 'No',
        ),
      );
      blocks.push(
        fieldBlock(
          doc,
          'Travels well in car',
          pet.travelsWellInCar === 'no'
            ? `No — ${pet.travelsWellInCarDetails ?? ''}`
            : pet.travelsWellInCar,
        ),
      );
    }
    if (pet.species === 'dog') {
      blocks.push(
        fieldBlock(
          doc,
          'Chases livestock',
          pet.chasesLivestock === 'yes' ? `Yes — ${pet.chasesLivestockDetails ?? ''}` : pet.chasesLivestock,
        ),
      );
    }
    blocks.push(
      fieldBlock(
        doc,
        'Allergies',
        pet.allergies.status === 'no' ? 'No' : `${pet.allergies.status} — ${pet.allergies.details ?? ''}`,
      ),
      fieldBlock(doc, 'On medication', medicationSummary(pet.medication)),
    );

    if (pet.species === 'dog' && pet.offLeadConsent) {
      blocks.push(spacerBlock(6));
      blocks.push(subheadingBlock(doc, 'Off-lead consent'));
      blocks.push(fieldBlock(doc, 'Lead', pet.offLeadConsent.mode === 'off_lead' ? 'Off lead' : 'On lead'));
      if (pet.offLeadConsent.mode === 'off_lead') {
        blocks.push(
          paragraphBlock(
            doc,
            (offLeadConsentText || DEFAULT_OFF_LEAD_CONSENT_TEXT).replaceAll('{{petName}}', pet.name),
          ),
        );
        if (pet.offLeadConsent.signature) {
          blocks.push(signatureBlock(pet.offLeadConsent.signature, `Off-lead consent signature — ${pet.name}`));
        }
      }
    }

    w.section(`Pet — ${pet.name}`, blocks);
  }

  const termsBlocks = termsHtml ? htmlToBlocks(doc, termsHtml) : [];
  w.startNewPage();
  w.section('Terms & conditions', termsBlocks.length > 0 ? termsBlocks : [numberedListBlock(doc, DEFAULT_TERMS)], { card: false });

  const agreement: AgreementData = state.agreement;
  const agreementBlocks: Block[] = [];
  if (agreement.signedName) {
    agreementBlocks.push(paragraphBlock(doc, declarationText || DEFAULT_DECLARATION_TEXT));
  }
  agreementBlocks.push(
    fieldBlock(doc, 'Signed by', agreement.signedName ?? ''),
    fieldBlock(doc, 'Signed at', now.toLocaleString('en-GB')),
  );
  if (agreement.signatureImage) {
    agreementBlocks.push(spacerBlock(4));
    agreementBlocks.push(signatureBlock(agreement.signatureImage, 'Client signature'));
  }
  w.section('Client agreement', agreementBlocks);

  w.finish(contact);

  return w.doc;
}
