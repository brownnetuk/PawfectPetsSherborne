import { FormField } from './form-field.types';

// Seeded (idempotently, alongside the other default forms) by
// FormsService.onModuleInit(). Sent by BoardingBookingsService.sendPreCheckIn()
// ahead of a stay (manually, or via the preCheckInDaysBefore cron).
//
// Rebuilt directly from the REAL public registration wizard
// (frontend/src/intake/, esp. IntakeForm.tsx + its steps/*.tsx), not from the
// separate "Customer Intake" Form document in this same Forms engine
// (default-customer-intake-form.ts) -- that document has drifted from what
// the real wizard actually collects (missing insured/insurer, missing the
// vaccine record photo, a stale "same as client" field the wizard no longer
// has, most conditional show/hide rules not implemented) and is being
// retired from use for exactly that reason (see forms.service.ts).
//
// Field-by-field, this mirrors the real wizard's Client details/Emergency
// contact/Emergency vet/Security/Additional info/Agreement steps and the
// full per-pet field set (client.*/emergencyContact.*/emergencyVet.*/
// security.*/agreement.* target 'customer'; pet fields target 'animal'),
// including every conditional (visibleWhen) the Forms engine's evaluator
// (frontend/src/forms/formDefaults.ts's isFieldVisible) can express -- it
// only supports flat equals/any/all rules comparing a field's own answer
// (as a string) against sibling fields in the SAME scope, so a few of the
// real wizard's finer-grained rules (a dynamically-changing label, "not
// equal to" in one step) are approximated as closely as that allows, same
// simplification the previous hand-written version of this form already
// accepted.
//
// The "Pet" group is createsAnimal:false (Customer Intake's own copy of
// these same fields is true) -- pre-check-in reviews/corrects a booking's
// EXISTING animals, so its answers must patch them, never register new ones.
//
// New: a SECOND top-level repeatable group, "Boarding Specific Questions",
// for feeding routine + crate-training. It's unmapped (no customer/animal
// target) -- these are stay-specific capture only, visible to staff via the
// submission view/PDF, the same way the old Pre-Check-In's own
// boarding-specific questions and stay-specific consent were never written
// back to a permanent record either. It's a SEPARATE top-level group (not
// nested inside "Pet") specifically because the Forms engine's paginator
// (frontend/src/forms/FormFillPage.tsx's buildPages()) only ever looks for
// `type:'group'` at the top level of a form's own field list -- a group
// repetition always renders as exactly one indivisible page, with no way to
// split it further via a startsNewPage marker on one of its own child
// fields. Making this its own top-level group means BoardingBookingsService.
// sendPreCheckIn()'s shapeSnapshotForBooking() (which resizes EVERY group
// field it finds to the booking's animal count/names, not just the first
// one) automatically gives it one page per pet too, appearing right after
// the "Pet" group's own per-pet pages -- a real per-dog "new page at the
// end", with no Forms-engine changes needed.
export const DEFAULT_PRE_CHECKIN_FORM: {
  name: string;
  description: string;
  fields: FormField[];
} = {
  name: 'Pre-Check In Form',
  description:
    'Sent ahead of a boarding or day care stay so we can confirm your details and any changes before drop-off.',
  fields: [
    // Every "...Heading" display field below (startsNewPage) does double
    // duty, same as every other form that uses this flag: read by
    // admin/src/pdf/formSubmissionPdf.ts as a marker that starts a new PDF
    // page section titled with that field's own label, AND (frontend/src/
    // forms/FormFillPage.tsx) as a real page break on the live customer-
    // facing form -- any top-level display field with startsNewPage turns
    // the whole form into a paginated, Back/Next wizard, matching the real
    // registration wizard's own step-by-step feel. "Client details" itself
    // doesn't set it, so it stays on the form's first page. The "Pet" and
    // "Boarding Specific Questions" groups need no heading/marker of their
    // own -- reaching a top-level group always starts a fresh page per
    // repetition once pagination is active at all (FormFillPage.tsx's
    // buildPages()), which is what gives "Boarding Specific Questions" its
    // own page(s) at the end without needing its own startsNewPage field.
    {
      id: 'cf-clientHeading',
      type: 'display',
      label: 'Client details',
      required: false,
    },
    // --- Client details (client.*, target: customer) ---
    {
      id: 'cf-firstName',
      type: 'text',
      label: 'First name',
      required: true,
      mapping: { target: 'customer', path: 'firstName' },
    },
    {
      id: 'cf-surname',
      type: 'text',
      label: 'Surname',
      required: false,
      mapping: { target: 'customer', path: 'surname' },
    },
    {
      id: 'cf-address1',
      type: 'text',
      label: 'First line of address',
      required: true,
      mapping: { target: 'customer', path: 'address1' },
    },
    {
      id: 'cf-address2',
      type: 'text',
      label: 'Second line of address',
      required: false,
      mapping: { target: 'customer', path: 'address2' },
    },
    {
      id: 'cf-town',
      type: 'text',
      label: 'Town',
      required: true,
      mapping: { target: 'customer', path: 'town' },
    },
    {
      id: 'cf-county',
      type: 'text',
      label: 'County',
      required: false,
      mapping: { target: 'customer', path: 'county' },
    },
    {
      id: 'cf-postcode',
      type: 'text',
      label: 'Postcode',
      required: true,
      mapping: { target: 'customer', path: 'postcode' },
    },
    {
      id: 'cf-phoneNumber',
      type: 'text',
      label: 'Phone number',
      required: true,
      mapping: { target: 'customer', path: 'phoneNumber' },
    },
    {
      id: 'cf-email',
      type: 'text',
      label: 'Email',
      required: true,
      mapping: { target: 'customer', path: 'email' },
    },

    {
      id: 'cf-ecHeading',
      type: 'display',
      label: 'Emergency contact',
      required: false,
      startsNewPage: true,
    },
    // --- Emergency contact (emergencyContact.*, target: customer) ---
    // No "same as client" shortcut -- the real wizard removed it and always
    // shows/requires these fields.
    {
      id: 'cf-ec-firstName',
      type: 'text',
      label: 'Emergency contact first name',
      required: true,
      mapping: { target: 'customer', path: 'emergencyContact.firstName' },
    },
    {
      id: 'cf-ec-surname',
      type: 'text',
      label: 'Emergency contact surname',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.surname' },
    },
    {
      id: 'cf-ec-address1',
      type: 'text',
      label: 'Emergency contact first line of address',
      required: true,
      mapping: { target: 'customer', path: 'emergencyContact.address1' },
    },
    {
      id: 'cf-ec-address2',
      type: 'text',
      label: 'Emergency contact second line of address',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.address2' },
    },
    {
      id: 'cf-ec-town',
      type: 'text',
      label: 'Emergency contact town',
      required: true,
      mapping: { target: 'customer', path: 'emergencyContact.town' },
    },
    {
      id: 'cf-ec-county',
      type: 'text',
      label: 'Emergency contact county',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.county' },
    },
    {
      id: 'cf-ec-postcode',
      type: 'text',
      label: 'Emergency contact postcode',
      required: true,
      mapping: { target: 'customer', path: 'emergencyContact.postcode' },
    },
    {
      id: 'cf-ec-phoneNumber',
      type: 'text',
      label: 'Emergency contact phone number',
      required: true,
      mapping: { target: 'customer', path: 'emergencyContact.phoneNumber' },
    },
    {
      id: 'cf-ec-email',
      type: 'text',
      label: 'Emergency contact email',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.email' },
    },

    {
      id: 'cf-evHeading',
      type: 'display',
      label: 'Emergency vet',
      required: false,
      startsNewPage: true,
    },
    // --- Emergency vet (emergencyVet.*, target: customer) ---
    {
      id: 'cf-ev-practiceName',
      type: 'text',
      label: 'Emergency vet practice name',
      required: true,
      mapping: { target: 'customer', path: 'emergencyVet.practiceName' },
    },
    {
      id: 'cf-ev-address1',
      type: 'text',
      label: 'Emergency vet first line of address',
      required: true,
      mapping: { target: 'customer', path: 'emergencyVet.address1' },
    },
    {
      id: 'cf-ev-address2',
      type: 'text',
      label: 'Emergency vet second line of address',
      required: false,
      mapping: { target: 'customer', path: 'emergencyVet.address2' },
    },
    {
      id: 'cf-ev-town',
      type: 'text',
      label: 'Emergency vet town',
      required: true,
      mapping: { target: 'customer', path: 'emergencyVet.town' },
    },
    {
      id: 'cf-ev-county',
      type: 'text',
      label: 'Emergency vet county',
      required: false,
      mapping: { target: 'customer', path: 'emergencyVet.county' },
    },
    {
      id: 'cf-ev-postcode',
      type: 'text',
      label: 'Emergency vet postcode',
      required: true,
      mapping: { target: 'customer', path: 'emergencyVet.postcode' },
    },
    {
      id: 'cf-ev-telephone',
      type: 'text',
      label: 'Emergency vet telephone',
      required: true,
      mapping: { target: 'customer', path: 'emergencyVet.telephone' },
    },
    {
      id: 'cf-ev-email',
      type: 'text',
      label: 'Emergency vet email',
      required: false,
      mapping: { target: 'customer', path: 'emergencyVet.email' },
    },
    // Same fallback wording as the real wizard's EmergencyVetStep -- that
    // step fetches this from Settings > Business Info (staff-editable) with
    // this exact text as the fallback; the Forms engine has no per-field
    // "fetch from Settings" mechanism (every field here is static, seeded
    // once), so it's baked in rather than left blank.
    {
      id: 'cf-ev-authText',
      type: 'display',
      label:
        'I authorise PawfectPets Sherborne to arrange alternative veterinary care for my pet if my usual vet is unobtainable in an emergency.',
      required: false,
    },
    {
      id: 'cf-ev-signedName',
      type: 'text',
      label: 'Alternative vet care authorisation -- typed name',
      required: true,
      mapping: {
        target: 'customer',
        path: 'emergencyVet.authorisation.signedName',
      },
    },
    {
      id: 'cf-ev-signature',
      type: 'signature',
      label: 'Alternative vet care authorisation -- signature',
      required: true,
      mapping: {
        target: 'customer',
        path: 'emergencyVet.authorisation.signatureImage',
      },
    },

    {
      id: 'cf-secHeading',
      type: 'display',
      label: 'Security & Agreement',
      required: false,
      startsNewPage: true,
    },
    // --- Security / additional info (security.*, target: customer) ---
    {
      id: 'cf-sec-keysProvided',
      type: 'toggle',
      label: 'Keys provided',
      required: false,
      mapping: { target: 'customer', path: 'security.keysProvided' },
    },
    {
      id: 'cf-sec-alarm',
      type: 'textarea',
      label: 'Alarm/KeySafe Code',
      required: false,
      mapping: { target: 'customer', path: 'security.alarmInstructions' },
    },
    {
      id: 'cf-sec-further',
      type: 'textarea',
      label: 'Any further information',
      required: false,
      mapping: { target: 'customer', path: 'security.furtherInformation' },
    },

    // --- Agreement (agreement.*, target: customer) ---
    // Same fallback terms list and declaration wording as the real wizard's
    // AgreementStep (both normally staff-editable via Settings > Business
    // Info -- termsDocx/declarationText -- with this exact copy as the
    // fallback), baked in for the same "no per-field Settings fetch" reason
    // as the vet-authorisation text above.
    {
      id: 'cf-ag-termsText',
      type: 'display',
      label:
        'Terms and conditions:\n' +
        '1. The client confirms all information provided in this form is accurate and will notify PawfectPets Sherborne promptly of any changes to contact, veterinary, or pet health details.\n' +
        "2. The client authorises PawfectPets Sherborne to make decisions regarding the animal's welfare in an emergency, including obtaining veterinary treatment as set out in the Emergency Vet section of this form.\n" +
        '3. The client is responsible for ensuring vaccinations, flea, and worming treatment are up to date for the duration of any care provided.\n' +
        '4. PawfectPets Sherborne will take all reasonable care of the animal but cannot be held liable for illness, injury, loss, or death outside of its direct negligence.\n' +
        '5. Where off-lead exercise has been consented to, the client accepts this is undertaken at their own risk as described in the Off-Lead Consent section.\n' +
        '6. Any keys or security information (e.g. alarm codes) provided will be stored securely and used solely for the purpose of delivering the agreed service.\n' +
        '7. Fees are payable as agreed at time of booking. PawfectPets Sherborne reserves the right to decline or discontinue a booking where an animal poses a safety risk not disclosed in this form.\n' +
        '8. This agreement remains in effect for all future bookings unless the client notifies PawfectPets Sherborne of a change in circumstances.',
      required: false,
    },
    {
      id: 'cf-ag-declarationText',
      type: 'display',
      label:
        'I confirm that the information provided in this form is accurate and complete to the best of my knowledge, and I agree to be bound by the terms set out above.',
      required: false,
    },
    {
      id: 'cf-ag-signedName',
      type: 'text',
      label: 'Agreement -- typed name',
      required: true,
      mapping: { target: 'customer', path: 'agreement.signedName' },
    },
    {
      id: 'cf-ag-signature',
      type: 'signature',
      label: 'Agreement -- signature',
      required: true,
      mapping: { target: 'customer', path: 'agreement.signatureImage' },
    },

    // --- Pet (repeatable, one per booking animal; target: animal) ---
    {
      id: 'cf-pets',
      type: 'group',
      label: 'Pet',
      required: false,
      repeatable: true,
      minRepeats: 1,
      // false (unlike Customer Intake's true) -- this form reviews/corrects
      // a booking's EXISTING animals, so its answers must patch them, never
      // register new ones. See FormSubmissionsService.submit()'s
      // createsAnimal:false branch.
      createsAnimal: false,
      fields: [
        {
          id: 'pf-species',
          type: 'choice',
          label: 'Type',
          required: true,
          options: ['dog', 'cat', 'other'],
          mapping: { target: 'animal', path: 'species' },
        },
        {
          id: 'pf-name',
          type: 'text',
          label: 'Name',
          required: true,
          mapping: { target: 'animal', path: 'name' },
        },
        {
          id: 'pf-breed',
          type: 'text',
          label: 'Breed / type of animal',
          required: true,
          mapping: { target: 'animal', path: 'breed' },
        },
        {
          id: 'pf-sex',
          type: 'choice',
          label: 'Sex',
          required: true,
          options: ['male', 'female'],
          mapping: { target: 'animal', path: 'sex' },
        },
        {
          id: 'pf-age',
          type: 'number',
          label: 'Age',
          required: true,
          mapping: { target: 'animal', path: 'age' },
        },
        {
          id: 'pf-dateOfBirth',
          type: 'date',
          label: 'Date of birth',
          required: false,
          mapping: { target: 'animal', path: 'dateOfBirth' },
        },
        {
          id: 'pf-vaccinated',
          type: 'toggle',
          label: 'Vaccinated',
          required: false,
          mapping: { target: 'animal', path: 'vaccinated' },
        },
        {
          id: 'pf-vaccineExpiryDate',
          type: 'date',
          label: 'Vaccine expiry date',
          required: false,
          mapping: { target: 'animal', path: 'vaccineExpiryDate' },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-vaccinated', equals: 'true' }] },
        },
        // No separate "vaccine record photo" field: the Forms engine's
        // file-type fields always coerce to an array (coerceFieldValue in
        // form-submission-mapping.util.ts), but Animal.vaccineRecordPhoto is
        // a single string -- submitting one would fail PublicUpdateAnimalDto's
        // @IsString() validation. The general "Photos" field below still
        // captures pet photos; this one real-wizard field has no clean home
        // in this engine without a Forms-engine change, so it's left out
        // rather than shipped broken.
        {
          id: 'pf-photos',
          type: 'file',
          label: 'Photos',
          required: false,
          maxFiles: 2,
          mapping: { target: 'animal', path: 'photos' },
        },
        {
          id: 'pf-colourMarkings',
          type: 'text',
          label: 'Colour / markings',
          required: false,
          mapping: { target: 'animal', path: 'colourMarkings' },
        },
        {
          id: 'pf-microchipNumber',
          type: 'text',
          label: 'Microchip number',
          required: false,
          mapping: { target: 'animal', path: 'microchipNumber' },
        },
        {
          id: 'pf-insured',
          type: 'toggle',
          label: 'Is your pet insured?',
          required: false,
          mapping: { target: 'animal', path: 'insured' },
        },
        {
          id: 'pf-insurer',
          type: 'text',
          label: 'Insurer',
          required: false,
          mapping: { target: 'animal', path: 'insurer' },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-insured', equals: 'true' }] },
        },
        {
          id: 'pf-neuteredStatus',
          type: 'choice',
          label: 'Is your pet Spayed/Neutered?',
          required: false,
          options: ['neutered', 'spayed', 'no'],
          mapping: { target: 'animal', path: 'neuteredStatus' },
        },
        {
          id: 'pf-lastSeasonEndDate',
          type: 'date',
          label: 'End date of last season?',
          required: false,
          mapping: { target: 'animal', path: 'lastSeasonEndDate' },
          // Only intact (not spayed/neutered) females can have a "last
          // season" -- a spayed dog doesn't have seasons.
          visibleWhen: {
            mode: 'all',
            conditions: [
              { fieldId: 'pf-neuteredStatus', equals: 'no' },
              { fieldId: 'pf-sex', equals: 'female' },
            ],
          },
        },
        {
          id: 'pf-temperamentNotes',
          type: 'textarea',
          label: 'Temperament notes',
          required: false,
          mapping: { target: 'animal', path: 'temperamentNotes' },
        },
        {
          id: 'pf-aggressionToPeople',
          type: 'toggle',
          label: 'Aggression to people',
          required: true,
          mapping: { target: 'animal', path: 'aggressionToPeople' },
        },
        {
          id: 'pf-aggressionToPeopleDetails',
          type: 'text',
          label: 'Aggression to people -- details',
          required: false,
          mapping: { target: 'animal', path: 'aggressionToPeopleDetails' },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-aggressionToPeople', equals: 'true' }] },
        },
        {
          id: 'pf-aggressionToOtherAnimals',
          type: 'toggle',
          label: 'Aggression to other animals',
          required: false,
          mapping: { target: 'animal', path: 'aggressionToOtherAnimals' },
          // Not asked about cats.
          visibleWhen: { mode: 'any', conditions: [{ fieldId: 'pf-species', equals: 'dog' }, { fieldId: 'pf-species', equals: 'other' }] },
        },
        {
          id: 'pf-aggressionToOtherAnimalsDetails',
          type: 'text',
          label: 'Aggression to other animals -- details',
          required: false,
          mapping: {
            target: 'animal',
            path: 'aggressionToOtherAnimalsDetails',
          },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-aggressionToOtherAnimals', equals: 'true' }] },
        },
        {
          id: 'pf-travelsWellInCar',
          type: 'choice',
          label: 'Travels well in car',
          required: false,
          options: ['yes', 'no', 'unsure'],
          mapping: { target: 'animal', path: 'travelsWellInCar' },
          // Not asked about cats.
          visibleWhen: { mode: 'any', conditions: [{ fieldId: 'pf-species', equals: 'dog' }, { fieldId: 'pf-species', equals: 'other' }] },
        },
        {
          id: 'pf-travelsWellInCarDetails',
          type: 'text',
          label: 'Travels well in car -- details',
          required: false,
          mapping: { target: 'animal', path: 'travelsWellInCarDetails' },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-travelsWellInCar', equals: 'no' }] },
        },
        {
          id: 'pf-chasesLivestock',
          type: 'choice',
          label: 'Chases livestock',
          required: false,
          options: ['yes', 'no', 'unsure'],
          mapping: { target: 'animal', path: 'chasesLivestock' },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-species', equals: 'dog' }] },
        },
        {
          id: 'pf-chasesLivestockDetails',
          type: 'text',
          label: 'Chases livestock -- details',
          required: false,
          mapping: { target: 'animal', path: 'chasesLivestockDetails' },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-chasesLivestock', equals: 'yes' }] },
        },
        {
          id: 'pf-allergiesStatus',
          type: 'choice',
          label: 'Allergies / intolerances',
          required: true,
          options: ['yes', 'no', 'unsure'],
          mapping: { target: 'animal', path: 'allergies.status' },
        },
        {
          id: 'pf-allergiesDetails',
          type: 'text',
          label: 'Allergy details',
          required: false,
          mapping: { target: 'animal', path: 'allergies.details' },
          visibleWhen: { mode: 'any', conditions: [{ fieldId: 'pf-allergiesStatus', equals: 'yes' }, { fieldId: 'pf-allergiesStatus', equals: 'unsure' }] },
        },
        {
          id: 'pf-onMedication',
          type: 'toggle',
          label: 'On medication',
          required: true,
          mapping: { target: 'animal', path: 'medication.onMedication' },
        },
        {
          id: 'pf-medicationName',
          type: 'text',
          label: 'Medication name',
          required: false,
          mapping: { target: 'animal', path: 'medication.medications[0].name' },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-onMedication', equals: 'true' }] },
        },
        {
          id: 'pf-medicationDetails',
          type: 'textarea',
          label: 'Medication details (illness, dosage, frequency)',
          required: false,
          mapping: {
            target: 'animal',
            path: 'medication.medications[0].additionalInfo',
          },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-onMedication', equals: 'true' }] },
        },
        {
          id: 'pf-medicationVetPrescribed',
          type: 'toggle',
          label: 'Medication vet prescribed',
          required: false,
          mapping: {
            target: 'animal',
            path: 'medication.medications[0].vetPrescribed',
          },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-onMedication', equals: 'true' }] },
        },
        {
          id: 'pf-medicationAdministeredByUs',
          type: 'toggle',
          label: 'We administer this medication',
          required: false,
          mapping: {
            target: 'animal',
            path: 'medication.medications[0].administeredByPawfectPets',
          },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-onMedication', equals: 'true' }] },
        },
        {
          id: 'pf-offLeadMode',
          type: 'choice',
          label: 'On lead / off lead',
          required: false,
          options: ['on_lead', 'off_lead'],
          mapping: { target: 'animal', path: 'offLeadConsent.mode' },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-species', equals: 'dog' }] },
        },
        // Same fallback wording as the real wizard's off-lead consent text
        // (Settings > Business Info's offLeadConsentText), minus the
        // {{petName}} substitution that wizard does -- this "Pet" group is a
        // shared template rendered once per repetition, and
        // form-placeholders.util.ts's {{petName}} only ever resolves for a
        // submission generated for one specific pet, not a per-repetition
        // group field, so it would show as literal, unresolved text here.
        {
          id: 'pf-offLeadConsentText',
          type: 'display',
          label: 'I consent to my dog being exercised off the lead, and understand this is at my own risk.',
          required: false,
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-offLeadMode', equals: 'off_lead' }] },
        },
        {
          id: 'pf-offLeadSignature',
          type: 'signature',
          label: 'Off-lead consent signature',
          required: false,
          mapping: { target: 'animal', path: 'offLeadConsent.signature' },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pf-offLeadMode', equals: 'off_lead' }] },
        },
      ],
    },

    // --- Boarding Specific Questions (repeatable, one per booking animal;
    // unmapped -- captured as submission answers only, never written to any
    // Customer/Animal record). See the file header comment for why this is
    // its own top-level group rather than nested inside "Pet".
    {
      id: 'bq-questions',
      type: 'group',
      label: 'Boarding Specific Questions',
      required: false,
      repeatable: true,
      minRepeats: 1,
      createsAnimal: false,
      fields: [
        {
          id: 'bq-feedingFrequency',
          type: 'text',
          label: 'How many times a day is your dog fed?',
          required: false,
        },
        {
          id: 'bq-feedingAmount',
          type: 'text',
          label: 'How much do you feed your dog? (e.g. weight, cups)',
          required: false,
        },
        {
          id: 'bq-feedingNotes',
          type: 'textarea',
          label: 'Any specific information around feeding?',
          required: false,
        },
        {
          id: 'bq-crateTrained',
          type: 'toggle',
          label: 'Is your dog crate trained?',
          required: false,
        },
        {
          id: 'bq-crateConsentText',
          type: 'display',
          label:
            'By signing below, you consent to your dog being crated during their stay when required (e.g. overnight, for their own safety, or during quiet periods) as part of our normal routine.',
          required: false,
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'bq-crateTrained', equals: 'true' }] },
        },
        {
          id: 'bq-crateConsentSignedName',
          type: 'text',
          label: 'Consent to crate -- typed name',
          required: false,
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'bq-crateTrained', equals: 'true' }] },
        },
        {
          id: 'bq-crateConsentSignature',
          type: 'signature',
          label: 'Consent to crate -- signature',
          required: false,
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'bq-crateTrained', equals: 'true' }] },
        },
        {
          id: 'bq-crateConsentDate',
          type: 'today',
          label: 'Date',
          required: false,
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'bq-crateTrained', equals: 'true' }] },
        },
      ],
    },
  ],
};
