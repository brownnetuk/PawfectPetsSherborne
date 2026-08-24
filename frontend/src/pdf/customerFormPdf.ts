// Adapted from admin/src/pdf/customerFormPdf.ts for this app's own data
// shape -- the two apps don't share code (see that file's own comments),
// and this one builds the PDF from the intake wizard's own in-memory
// IntakeState right at submission time, not a re-fetched Customer/Animal
// record, so it can include the signature/typed-name the customer *just*
// gave (before the server's even responded) and doesn't need a
// server-computed field (name/address/signedAt) it was never given in the
// first place. The drawing primitives (PdfWriter, fieldBlock, etc.) are
// unchanged from admin's version; only the top-level data gathering differs.
import { jsPDF } from 'jspdf';
import logoUrl from '../assets/logo.png';
import type { AgreementData, IntakeState, MedicationInfo, PetDetails } from '../types';

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4, points
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const HEADER_HEIGHT = 74;
const FOOTER_HEIGHT = 30;
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT + 14;

// Brand palette -- kept in sync by hand with the CSS variables in
// frontend/src/index.css (there's no shared token source between the apps).
const GREEN: [number, number, number] = [31, 59, 44];
const ACCENT: [number, number, number] = [232, 150, 60];
const ACCENT_DARK: [number, number, number] = [204, 122, 36];
const MUTED: [number, number, number] = [111, 125, 114];
const BORDER: [number, number, number] = [227, 232, 222];
const INK: [number, number, number] = [35, 44, 38];

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

interface Block {
  height: number;
  draw: (doc: jsPDF, y: number) => void;
}

const FIELD_LABEL_WIDTH = 170;

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

function fieldBlock(doc: jsPDF, label: string, value: string): Block {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(value || '—', CONTENT_WIDTH - FIELD_LABEL_WIDTH) as string[];
  const height = lines.length * 13 + 6;
  return {
    height,
    draw(doc, y) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(label.toUpperCase(), MARGIN, y);
      doc.setTextColor(...INK);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      lines.forEach((line, i) => doc.text(line, MARGIN + FIELD_LABEL_WIDTH, y + i * 13));
    },
  };
}

function paragraphBlock(doc: jsPDF, text: string): Block {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
  const height = lines.length * 12 + 8;
  return {
    height,
    draw(doc, y) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...INK);
      lines.forEach((line, i) => doc.text(line, MARGIN, y + i * 12));
    },
  };
}

function subheadingBlock(text: string): Block {
  return {
    height: 20,
    draw(doc, y) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...ACCENT_DARK);
      doc.text(text, MARGIN, y);
      doc.setTextColor(...INK);
    },
  };
}

function numberedListBlock(doc: jsPDF, items: string[]): Block {
  doc.setFontSize(9);
  const wrapped = items.map((item, i) => doc.splitTextToSize(`${i + 1}. ${item}`, CONTENT_WIDTH - 12) as string[]);
  const height = wrapped.reduce((sum, lines) => sum + lines.length * 12 + 4, 0);
  return {
    height,
    draw(doc, y) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      let cursor = y;
      wrapped.forEach((lines) => {
        lines.forEach((line, idx) => doc.text(line, MARGIN + (idx === 0 ? 0 : 12), cursor + idx * 12));
        cursor += lines.length * 12 + 4;
      });
    },
  };
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
    blocks.push(/^h[1-6]$/.test(tag) ? subheadingBlock(text) : paragraphBlock(doc, text));
  }
  return blocks;
}

function signatureBlock(dataUrl: string, label: string): Block {
  const w = 200;
  const h = 65;
  return {
    height: h + 36,
    draw(doc, y) {
      try {
        doc.addImage(dataUrl, 'PNG', MARGIN, y, w, h);
      } catch {
        // Malformed signature data -- skip the image rather than fail the whole PDF.
      }
      doc.setDrawColor(...BORDER);
      doc.line(MARGIN, y + h + 4, MARGIN + w, y + h + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(label, MARGIN, y + h + 16);
      doc.setTextColor(...INK);
    },
  };
}

function spacerBlock(h: number): Block {
  return { height: h, draw: () => {} };
}

function yesNo(v: boolean): string {
  return v ? 'Yes' : 'No';
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

class PdfWriter {
  doc = new jsPDF({ unit: 'pt', format: 'a4' });
  y = MARGIN;
  private pageCount = 1;

  drawHeader(logo: string | null, subtitle: string) {
    const doc = this.doc;
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, PAGE_WIDTH, HEADER_HEIGHT, 'F');

    const badgeCx = MARGIN + 17;
    const badgeCy = HEADER_HEIGHT / 2;
    doc.setFillColor(255, 255, 255);
    doc.circle(badgeCx, badgeCy, 19, 'F');
    if (logo) {
      try {
        doc.addImage(logo, 'PNG', badgeCx - 14, badgeCy - 14, 28, 28);
      } catch {
        // ignore malformed logo data
      }
    }

    doc.setFont('times', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(255, 255, 255);
    doc.text('PawfectPets Sherborne', MARGIN + 46, badgeCy - 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(224, 233, 226);
    doc.text(subtitle, MARGIN + 46, badgeCy + 14);

    doc.setTextColor(...INK);
    this.y = HEADER_HEIGHT + 26;
  }

  private newPage() {
    this.doc.addPage();
    this.pageCount += 1;
    this.y = MARGIN;
  }

  startNewPage() {
    if (this.y > MARGIN) this.newPage();
  }

  private ensureSpace(h: number) {
    if (this.y + h > CONTENT_BOTTOM) this.newPage();
  }

  section(title: string, blocks: Block[]) {
    const preGap = 10;
    const headingHeight = preGap + 23;
    const total = headingHeight + blocks.reduce((sum, b) => sum + b.height, 0);
    const remaining = CONTENT_BOTTOM - this.y;
    const fitsFreshPage = total <= CONTENT_BOTTOM - MARGIN;
    if (total > remaining && fitsFreshPage && this.y > MARGIN) {
      this.newPage();
    }

    this.ensureSpace(headingHeight);
    this.y += preGap;
    const doc = this.doc;
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...GREEN);
    doc.text(title, MARGIN, this.y);
    doc.setTextColor(...INK);
    this.y += 7;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(1.6);
    doc.line(MARGIN, this.y, MARGIN + 46, this.y);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.75);
    doc.line(MARGIN + 46, this.y, PAGE_WIDTH - MARGIN, this.y);
    doc.setLineWidth(1);
    this.y += 16;

    for (const block of blocks) {
      this.ensureSpace(block.height);
      block.draw(doc, this.y);
      this.y += block.height;
    }
  }

  finish(generatedNote: string) {
    const total = this.doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      this.doc.setPage(i);
      this.doc.setDrawColor(...BORDER);
      this.doc.setLineWidth(0.75);
      this.doc.line(MARGIN, PAGE_HEIGHT - MARGIN - 16, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN - 16);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(...MUTED);
      this.doc.text(generatedNote, MARGIN, PAGE_HEIGHT - MARGIN - 4);
      this.doc.text(`Page ${i} of ${total}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN - 4, { align: 'right' });
      this.doc.setTextColor(...INK);
    }
  }
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
  const logo = await loadLogoDataUrl();
  const w = new PdfWriter();
  const doc = w.doc;
  const now = new Date();
  const customerName = formatFullName(state.client.firstName, state.client.surname);

  const subtitle = `Registration form — ${customerName} — signed ${now.toLocaleDateString('en-GB')}`;
  w.drawHeader(logo, subtitle);

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
    fieldBlock(doc, 'Alarm instructions', state.security.alarmInstructions || '(none provided)'),
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
      blocks.push(fieldBlock(doc, 'Travels well in car', pet.travelsWellInCar));
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
      blocks.push(subheadingBlock('Off-lead consent'));
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
  w.section('Terms & conditions', termsBlocks.length > 0 ? termsBlocks : [numberedListBlock(doc, DEFAULT_TERMS)]);

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

  w.finish(`Generated ${now.toLocaleDateString('en-GB')} · PawfectPets Sherborne`);

  return w.doc;
}
