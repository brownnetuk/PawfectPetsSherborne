import { FormField } from './form-field.types';

// Seeded (idempotently, alongside DEFAULT_CUSTOMER_INTAKE_FORM) from
// FormsService.onModuleInit() -- built from the business's own
// "Check-In / Check-Out Form" paper record. One form per stage rather than
// per Boarding/Day Care (nothing in the content is boarding-specific), so
// Settings > Boarding's Boarding/Day Care pickers for each stage can both
// point at the same one; staff are free to duplicate/edit/replace either
// after the fact like any other form.
//
// Deliberate simplifications versus the paper form:
//  - "Owner's name" isn't a field -- the submission is already tied to the
//    booking's customer (shown in its recipient name/PDF header), so asking
//    again would be redundant.
//  - The belongings table (item / brought / returned / notes) is flattened
//    to a multichoice list of the same items plus one free-text notes field
//    -- the Forms engine has no native table field.
//  - "Weight / body condition" stays a free-text field (as titled on the
//    paper form) rather than splitting into a number field, since it's
//    often a description ("lost weight since last stay") not just a figure.
const BELONGINGS = [
  'Food',
  'Medication',
  'Lead',
  'Harness',
  'Collar',
  'Bed',
  'Blanket',
  'Crate',
  'Toys',
  'Bowls',
  'Other',
];

export const DEFAULT_CHECKIN_FORM: { name: string; description: string; fields: FormField[] } = {
  name: 'Arrival Check-In',
  description: 'Completed by staff when a dog arrives for boarding or day care.',
  fields: [
    { id: 'ci-arrivalDateTime', type: 'datetime', label: 'Date & time of arrival', required: false },
    { id: 'ci-receivedBy', type: 'text', label: 'Received by (staff)', required: true, defaultValue: '{{staffMemberSignedIn}}' },
    { id: 'ci-vaccinationChecked', type: 'toggle', label: 'Vaccination record checked and current', required: false },
    { id: 'ci-feedingConfirmed', type: 'toggle', label: 'Feeding instructions confirmed with owner', required: false },
    { id: 'ci-emergencyContactConfirmed', type: 'toggle', label: 'Emergency contact confirmed', required: false },
    { id: 'ci-consentCompleted', type: 'toggle', label: 'Consent forms completed', required: false },
    {
      id: 'ci-pets',
      type: 'group',
      label: 'Pet',
      required: false,
      repeatable: true,
      minRepeats: 1,
      createsAnimal: false,
      fields: [
        { id: 'ci-petName', type: 'choice', label: "Dog's name", required: true, options: [], optionsSource: 'customerPets' },
        { id: 'ci-belongingsBrought', type: 'multichoice', label: 'Belongings brought', required: false, options: BELONGINGS },
        { id: 'ci-belongingsNotes', type: 'textarea', label: 'Belongings notes (quantity / details)', required: false },
        { id: 'ci-coatSkin', type: 'textarea', label: 'Coat & skin condition', required: false },
        { id: 'ci-weightBody', type: 'textarea', label: 'Weight / body condition', required: false },
        { id: 'ci-eyesEarsTeeth', type: 'textarea', label: 'Eyes, ears, teeth', required: false },
        { id: 'ci-behaviour', type: 'textarea', label: 'Behaviour / temperament', required: false },
        { id: 'ci-injuries', type: 'textarea', label: 'Any injuries or issues noted', required: false },
        { id: 'ci-photos', type: 'file', label: 'Photos', required: false },
      ],
    },
    { id: 'ci-ownerSignature', type: 'signature', label: 'Owner signature (drop-off)', required: true },
    { id: 'ci-staffSignature', type: 'signature', label: 'Staff signature (drop-off)', required: true },
  ],
};

// The check-out form's "did anything happen during the stay" toggles, each
// paired with a details box that only appears once its toggle is ticked
// (visibleWhen) -- required while visible, so a ticked toggle can't be
// submitted without saying what happened. Exported so FormsService can add
// a missing details box to a check-out form that was seeded before these
// existed (seeding never touches a form once it exists).
export const CHECKOUT_STAY_TOGGLES: { toggle: FormField; details: FormField }[] = [
  {
    toggle: { id: 'co-incidents', type: 'toggle', label: 'Any incidents during the stay', required: false },
    details: {
      id: 'co-incidentsDetails',
      type: 'textarea',
      label: 'Incident details (what happened)',
      required: true,
      visibleWhen: { mode: 'all', conditions: [{ fieldId: 'co-incidents', equals: 'true' }] },
    },
  },
  {
    toggle: { id: 'co-vetTreatment', type: 'toggle', label: 'Any veterinary treatment during the stay', required: false },
    details: {
      id: 'co-vetTreatmentDetails',
      type: 'textarea',
      label: 'Veterinary treatment details (what happened)',
      required: true,
      visibleWhen: { mode: 'all', conditions: [{ fieldId: 'co-vetTreatment', equals: 'true' }] },
    },
  },
  {
    toggle: {
      id: 'co-medicationAdministered',
      type: 'toggle',
      label: 'Any medication administered during the stay',
      required: false,
    },
    details: {
      id: 'co-medicationAdministeredDetails',
      type: 'textarea',
      label: 'Medication details (what was given, when)',
      required: true,
      visibleWhen: { mode: 'all', conditions: [{ fieldId: 'co-medicationAdministered', equals: 'true' }] },
    },
  },
];

export const DEFAULT_CHECKOUT_FORM: { name: string; description: string; fields: FormField[] } = {
  name: 'Departure Check-Out',
  description: 'Completed by staff when a dog is collected from boarding or day care.',
  fields: [
    { id: 'co-departureDateTime', type: 'datetime', label: 'Date & time of departure', required: false },
    { id: 'co-releasedBy', type: 'text', label: 'Released by (staff)', required: true, defaultValue: '{{staffMemberSignedIn}}' },
    ...CHECKOUT_STAY_TOGGLES.flatMap(({ toggle, details }) => [toggle, details]),
    { id: 'co-feesPaid', type: 'toggle', label: 'Fees paid in full', required: false },
    {
      id: 'co-pets',
      type: 'group',
      label: 'Pet',
      required: false,
      repeatable: true,
      minRepeats: 1,
      createsAnimal: false,
      fields: [
        { id: 'co-petName', type: 'choice', label: "Dog's name", required: true, options: [], optionsSource: 'customerPets' },
        { id: 'co-belongingsReturned', type: 'multichoice', label: 'Belongings returned', required: false, options: BELONGINGS },
        { id: 'co-belongingsNotes', type: 'textarea', label: 'Belongings notes (quantity / details)', required: false },
        { id: 'co-coatSkin', type: 'textarea', label: 'Coat & skin condition', required: false },
        { id: 'co-weightBody', type: 'textarea', label: 'Weight / body condition', required: false },
        { id: 'co-eyesEarsTeeth', type: 'textarea', label: 'Eyes, ears, teeth', required: false },
        { id: 'co-behaviour', type: 'textarea', label: 'Behaviour / temperament', required: false },
        { id: 'co-injuries', type: 'textarea', label: 'Any injuries or issues noted', required: false },
      ],
    },
    { id: 'co-ownerSignature', type: 'signature', label: 'Owner signature (collection)', required: true },
    { id: 'co-staffSignature', type: 'signature', label: 'Staff signature (collection)', required: true },
  ],
};
