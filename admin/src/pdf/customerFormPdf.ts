import { jsPDF } from 'jspdf';
import type { Animal, Customer } from '../types';

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4, points
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Mirrors the terms text in frontend/src/intake/steps/AgreementStep.tsx -- kept
// in sync manually since the two apps don't share code.
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

class PdfWriter {
  doc = new jsPDF({ unit: 'pt', format: 'a4' });
  y = MARGIN;

  private ensureSpace(h: number) {
    if (this.y + h > PAGE_HEIGHT - MARGIN) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  title(text: string) {
    this.ensureSpace(24);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(18);
    this.doc.setTextColor(31, 59, 44);
    this.doc.text(text, MARGIN, this.y);
    this.doc.setTextColor(0, 0, 0);
    this.y += 22;
  }

  subtitle(text: string) {
    this.ensureSpace(20);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    this.doc.setTextColor(100, 100, 100);
    this.doc.text(text, MARGIN, this.y);
    this.doc.setTextColor(0, 0, 0);
    this.y += 26;
  }

  heading(text: string) {
    this.ensureSpace(28);
    this.y += 4;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(13);
    this.doc.setTextColor(31, 59, 44);
    this.doc.text(text, MARGIN, this.y);
    this.doc.setTextColor(0, 0, 0);
    this.y += 8;
    this.doc.setDrawColor(210, 214, 205);
    this.doc.line(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y);
    this.y += 14;
  }

  subheading(text: string) {
    this.ensureSpace(18);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.text(text, MARGIN, this.y);
    this.y += 16;
  }

  field(label: string, value: string) {
    const size = 10;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(size);
    const lines = this.doc.splitTextToSize(value || '—', CONTENT_WIDTH - 150) as string[];
    this.ensureSpace(lines.length * 13 + 4);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8.5);
    this.doc.setTextColor(110, 110, 110);
    this.doc.text(label.toUpperCase(), MARGIN, this.y);
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(size);
    lines.forEach((line, i) => this.doc.text(line, MARGIN + 150, this.y + i * 13));
    this.y += lines.length * 13 + 6;
  }

  paragraph(text: string) {
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9.5);
    const lines = this.doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
    this.ensureSpace(lines.length * 12 + 4);
    lines.forEach((line, i) => this.doc.text(line, MARGIN, this.y + i * 12));
    this.y += lines.length * 12 + 8;
  }

  numberedList(items: string[]) {
    this.doc.setFontSize(9);
    items.forEach((item, i) => {
      this.doc.setFont('helvetica', 'normal');
      const lines = this.doc.splitTextToSize(`${i + 1}. ${item}`, CONTENT_WIDTH - 12) as string[];
      this.ensureSpace(lines.length * 12 + 4);
      lines.forEach((line, idx) => this.doc.text(line, MARGIN + (idx === 0 ? 0 : 12), this.y + idx * 12));
      this.y += lines.length * 12 + 4;
    });
  }

  signatureImage(dataUrl: string, label: string) {
    const w = 200;
    const h = 65;
    this.ensureSpace(h + 20);
    try {
      this.doc.addImage(dataUrl, 'PNG', MARGIN, this.y, w, h);
    } catch {
      // Malformed/legacy signature data -- skip the image rather than fail the whole PDF.
    }
    this.doc.setDrawColor(200, 200, 200);
    this.doc.line(MARGIN, this.y + h + 4, MARGIN + w, this.y + h + 4);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(110, 110, 110);
    this.doc.text(label, MARGIN, this.y + h + 16);
    this.doc.setTextColor(0, 0, 0);
    this.y += h + 26;
  }

  spacer(h = 10) {
    this.y += h;
  }
}

function yesNo(v: boolean): string {
  return v ? 'Yes' : 'No';
}

export function buildCustomerFormPdf(
  customer: Customer,
  animals: Animal[],
  alarmInstructions: string | null,
): jsPDF {
  const w = new PdfWriter();

  w.title('PawfectPets Sherborne');
  w.subtitle(
    `Registration form — ${customer.name}${
      customer.agreement?.signedAt ? ` — signed ${new Date(customer.agreement.signedAt).toLocaleDateString('en-GB')}` : ''
    }`,
  );

  w.heading('Client details');
  w.field('Name', customer.name);
  w.field('Email', customer.email);
  w.field('Mobile', customer.mobile ?? '');
  w.field('Telephone', customer.telephone ?? '');
  w.field('Address', customer.address ?? '');

  w.heading('Emergency contact');
  const ec = customer.emergencyContact;
  if (ec?.sameAsClient) {
    w.field('Contact', 'Same as client');
  } else {
    w.field('Name', ec?.name ?? '');
    w.field('Address', ec?.address ?? '');
    w.field('Telephone', ec?.telephone ?? '');
    w.field('Mobile', ec?.mobile ?? '');
    w.field('Email', ec?.email ?? '');
  }

  w.heading('Emergency vet');
  const ev = customer.emergencyVet;
  w.field('Practice', ev?.practiceName ?? '');
  w.field('Address', ev?.address ?? '');
  w.field('Telephone', ev?.telephone ?? '');
  w.field('Email', ev?.email ?? '');
  w.field('Alternative care authorised', ev ? yesNo(ev.alternativeVetAuthorised) : '—');

  w.heading('Security arrangements');
  w.field('Keys provided', customer.security ? yesNo(customer.security.keysProvided) : '—');
  w.field('Alarm instructions', alarmInstructions || '(none provided)');
  w.field('Further information', customer.security?.furtherInformation ?? '');

  for (const animal of animals) {
    w.heading(`Pet — ${animal.name}`);
    w.field('Species', animal.species);
    w.field('Breed', animal.breed);
    w.field('Sex', animal.sex);
    w.field('Age', String(animal.age));
    w.field(
      'Vaccinated',
      animal.vaccinated
        ? `Yes (expires ${animal.vaccineExpiryDate ? new Date(animal.vaccineExpiryDate).toLocaleDateString('en-GB') : 'unknown'})`
        : 'No',
    );
    w.field('Colour / markings', animal.colourMarkings ?? '');
    w.field('Microchip number', animal.microchipNumber ?? '');
    w.field('Has collar', yesNo(animal.hasCollar));
    w.field('Temperament notes', animal.temperamentNotes ?? '');
    w.field(
      'Aggression to people',
      animal.aggressionToPeople ? `Yes — ${animal.aggressionToPeopleDetails ?? ''}` : 'No',
    );
    w.field(
      'Aggression to other animals',
      animal.aggressionToOtherAnimals ? `Yes — ${animal.aggressionToOtherAnimalsDetails ?? ''}` : 'No',
    );
    w.field('Travels well in car', animal.travelsWellInCar);
    w.field('Chases livestock', animal.chasesLivestock);
    w.field(
      'Allergies',
      animal.allergies.status === 'no' ? 'No' : `${animal.allergies.status} — ${animal.allergies.details ?? ''}`,
    );
    w.field(
      'On medication',
      animal.medication.onMedication ? `Yes — ${animal.medication.details ?? ''}` : 'No',
    );

    if (animal.species === 'dog' && animal.offLeadConsent) {
      w.subheading('Off-lead consent');
      w.field('Lead', animal.offLeadConsent.mode === 'off_lead' ? 'Off lead' : 'On lead');
      if (animal.offLeadConsent.mode === 'off_lead') {
        w.paragraph(
          `I consent to ${animal.name} being exercised off the lead, and understand this is at my own risk.`,
        );
        if (animal.offLeadConsent.signature) {
          w.signatureImage(animal.offLeadConsent.signature, `Off-lead consent signature — ${animal.name}`);
        }
      }
    }
  }

  w.heading('Terms & conditions');
  w.numberedList(TERMS);

  w.heading('Client agreement');
  w.field('Signed by', customer.agreement?.signedName ?? '');
  w.field(
    'Signed at',
    customer.agreement?.signedAt ? new Date(customer.agreement.signedAt).toLocaleString('en-GB') : '',
  );
  if (customer.agreement?.signatureImage) {
    w.spacer(4);
    w.signatureImage(customer.agreement.signatureImage, 'Client signature');
  }

  return w.doc;
}
