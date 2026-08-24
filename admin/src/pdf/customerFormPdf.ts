import { jsPDF } from 'jspdf';
import logoUrl from '../assets/logo.png';
import type { Animal, Customer } from '../types';

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4, points
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const HEADER_HEIGHT = 74;
const FOOTER_HEIGHT = 30;
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT + 14;

// Brand palette -- kept in sync by hand with the CSS variables in
// admin/src/index.css (there's no shared token source between the two).
const GREEN: [number, number, number] = [31, 59, 44]; // --brand-green
const ACCENT: [number, number, number] = [232, 150, 60]; // --accent
const ACCENT_DARK: [number, number, number] = [204, 122, 36]; // --accent-dark
const MUTED: [number, number, number] = [111, 125, 114]; // --muted
const BORDER: [number, number, number] = [227, 232, 222]; // --border
const INK: [number, number, number] = [35, 44, 38]; // --ink

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

// Same idea, for Off-lead consent -- {{petName}} is substituted with the
// actual pet's name below.
const DEFAULT_OFF_LEAD_CONSENT_TEXT =
  'I consent to {{petName}} being exercised off the lead, and understand this is at my own risk.';

/** A pre-measured, self-contained chunk of content: know its height before drawing it. */
interface Block {
  height: number;
  draw: (doc: jsPDF, y: number) => void;
}

// Wide enough for the longest label actually used ("Alternative care
// authorisation" measures ~156pt at this weight/size) plus a gap before the
// value column -- a fixed column keeps every field's value aligned, but it
// has to be sized to the longest label or long ones overrun into the value.
const FIELD_LABEL_WIDTH = 170;

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
  if (animal.neuteredStatus === 'spayed') {
    return animal.lastSeasonEndDate
      ? `Spayed (Girl) — last season ended ${new Date(animal.lastSeasonEndDate).toLocaleDateString('en-GB')}`
      : 'Spayed (Girl)';
  }
  return 'No';
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

function listBlock(doc: jsPDF, items: string[], marker: (i: number) => string): Block {
  doc.setFontSize(9);
  const wrapped = items.map((item, i) => doc.splitTextToSize(`${marker(i)}${item}`, CONTENT_WIDTH - 12) as string[]);
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

function numberedListBlock(doc: jsPDF, items: string[]): Block {
  return listBlock(doc, items, (i) => `${i + 1}. `);
}

function bulletListBlock(doc: jsPDF, items: string[]): Block {
  return listBlock(doc, items, () => '• ');
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
    blocks.push(/^h[1-6]$/.test(tag) ? subheadingBlock(text) : paragraphBlock(doc, text));
  }
  return blocks;
}

function signatureBlock(dataUrl: string, label: string): Block {
  const w = 200;
  const h = 65;
  return {
    // 4 (image-to-line) + 12 (line-to-caption) + 20 trailing -- matches the
    // ~19-20pt baseline-to-next-content gap every other block type leaves,
    // so a heading landing right after a signature doesn't crowd its caption.
    height: h + 36,
    draw(doc, y) {
      try {
        doc.addImage(dataUrl, 'PNG', MARGIN, y, w, h);
      } catch {
        // Malformed/legacy signature data -- skip the image rather than fail the whole PDF.
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

  /** Forces the next section onto a fresh page, unless one's already blank. */
  startNewPage() {
    if (this.y > MARGIN) {
      this.newPage();
    }
  }

  private ensureSpace(h: number) {
    if (this.y + h > CONTENT_BOTTOM) {
      this.newPage();
    }
  }

  /**
   * Renders a heading followed by its blocks, keeping the whole section
   * together on one page when it's short enough to fit a fresh page --
   * rather than letting it split awkwardly mid-way. A section too tall for
   * even a full page still flows across pages field-by-field, never cutting
   * a single field/paragraph/image in half.
   */
  section(title: string, blocks: Block[]) {
    // A fixed gap ahead of every heading, regardless of what block preceded
    // it -- blocks size their own trailing margin for "another block like
    // me" (a field, a line of a paragraph), which isn't always enough
    // clearance for a 14pt bold heading landing right after.
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

export async function buildCustomerFormPdf(
  customer: Customer,
  animals: Animal[],
  alarmInstructions: string | null,
  termsHtml?: string,
  emergencyVetAuthorisationText?: string,
  offLeadConsentText?: string,
): Promise<jsPDF> {
  const logo = await loadLogoDataUrl();
  const w = new PdfWriter();
  const doc = w.doc;

  const subtitle = `Registration form — ${customer.name}${
    customer.agreement?.signedAt
      ? ` — signed ${new Date(customer.agreement.signedAt).toLocaleDateString('en-GB')}`
      : ''
  }`;
  w.drawHeader(logo, subtitle);

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
    fieldBlock(doc, 'Alarm instructions', alarmInstructions || '(none provided)'),
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
      blocks.push(fieldBlock(doc, 'Travels well in car', animal.travelsWellInCar ?? ''));
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
      blocks.push(subheadingBlock('Off-lead consent'));
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
  w.section('Terms & conditions', termsBlocks.length > 0 ? termsBlocks : [numberedListBlock(doc, TERMS)]);

  const agreementBlocks: Block[] = [
    fieldBlock(doc, 'Signed by', customer.agreement?.signedName ?? ''),
    fieldBlock(
      doc,
      'Signed at',
      customer.agreement?.signedAt ? new Date(customer.agreement.signedAt).toLocaleString('en-GB') : '',
    ),
  ];
  if (customer.agreement?.signatureImage) {
    agreementBlocks.push(spacerBlock(4));
    agreementBlocks.push(signatureBlock(customer.agreement.signatureImage, 'Client signature'));
  }
  w.section('Client agreement', agreementBlocks);

  w.finish(`Generated ${new Date().toLocaleDateString('en-GB')} · PawfectPets Sherborne`);

  return w.doc;
}
