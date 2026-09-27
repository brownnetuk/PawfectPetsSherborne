import { FormField } from './form-field.types';

// Seeded (idempotently, alongside the other default forms) by
// FormsService.onModuleInit(). Sent by BoardingBookingsService.sendPreCheckIn()
// ahead of a stay (manually, or via the preCheckInDaysBefore cron).
//
// This is an exact duplicate of DEFAULT_CUSTOMER_INTAKE_FORM's own field list
// (same ids, labels, required flags, mapping paths, visibleWhen) -- kept as
// its own copy, not a shared import, so the two forms can be edited
// independently from here on, per an explicit request to stop hand-maintaining
// a separate, drifting field list for Pre-Check-In. The only field-shape
// change is the "Pet" group's createsAnimal: false (Customer Intake's is
// true) -- pre-check-in reviews/corrects a booking's EXISTING animals, so it
// must patch them, never register new ones.
//
// Every field's mapping (target: 'customer'/'animal') is unchanged from
// Customer Intake, which is what actually makes this form functional rather
// than a static copy:
//  - FormSubmissionsService.submit() applies every 'customer'-mapped
//    top-level field as a patch onto the real Customer record (via
//    buildCustomerPatch()), and every 'animal'-mapped field inside a
//    createsAnimal:false group as a patch onto each of the submission's real
//    existing Animals, in order (see submit()'s "other half of
//    createsAnimal:false" branch) -- both keyed generically off
//    field.mapping.target/path and group.type/createsAnimal, never off any
//    specific field id, so this works identically to the old hand-written
//    Pre-Check-In form despite the different (cf-*/pf-*) ids.
//  - BoardingBookingsService.sendPreCheckIn()'s shapeSnapshotForBooking()/
//    buildPreCheckInAnswers() helpers are equally generic: they resize
//    whichever field has type:'group' to the booking's animals and pre-fill
//    every mapped field's answer from the live Customer/Animal records, again
//    with no dependency on a specific field id -- so pre-filling and the
//    "edits sync back to the record" loop both keep working unchanged.
//
// Deliberately NOT carried over from the old Pre-Check-In definition (an
// explicit "exact clone, nothing extra" choice, not an oversight): the
// booking-reference display field, the startsNewPage page-break markers (this
// form is a single long page, same as Customer Intake), the boarding-specific
// symptoms question, and the stay-specific consent/signature section. None of
// those exist on Customer Intake, so an exact duplicate doesn't have them
// either.
export const DEFAULT_PRE_CHECKIN_FORM: {
  name: string;
  description: string;
  fields: FormField[];
} = {
  name: 'Pre-Check In Form',
  description:
    'Sent ahead of a boarding or day care stay so we can confirm your details and any changes before drop-off.',
  fields: [
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
      label: 'Address line 1',
      required: true,
      mapping: { target: 'customer', path: 'address1' },
    },
    {
      id: 'cf-address2',
      type: 'text',
      label: 'Address line 2',
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
      id: 'cf-ec-sameAsClient',
      type: 'toggle',
      label: 'Emergency contact same as client',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.sameAsClient' },
    },
    {
      id: 'cf-ec-firstName',
      type: 'text',
      label: 'Emergency contact first name',
      required: false,
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
      label: 'Emergency contact address line 1',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.address1' },
    },
    {
      id: 'cf-ec-address2',
      type: 'text',
      label: 'Emergency contact address line 2',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.address2' },
    },
    {
      id: 'cf-ec-town',
      type: 'text',
      label: 'Emergency contact town',
      required: false,
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
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.postcode' },
    },
    {
      id: 'cf-ec-phoneNumber',
      type: 'text',
      label: 'Emergency contact phone number',
      required: false,
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
      id: 'cf-ev-practiceName',
      type: 'text',
      label: 'Emergency vet practice name',
      required: true,
      mapping: { target: 'customer', path: 'emergencyVet.practiceName' },
    },
    {
      id: 'cf-ev-address1',
      type: 'text',
      label: 'Emergency vet address line 1',
      required: true,
      mapping: { target: 'customer', path: 'emergencyVet.address1' },
    },
    {
      id: 'cf-ev-address2',
      type: 'text',
      label: 'Emergency vet address line 2',
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
      label: 'Further security information',
      required: false,
      mapping: { target: 'customer', path: 'security.furtherInformation' },
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
        },
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
        },
        {
          id: 'pf-aggressionToOtherAnimals',
          type: 'toggle',
          label: 'Aggression to other animals (dogs/other only)',
          required: false,
          mapping: { target: 'animal', path: 'aggressionToOtherAnimals' },
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
        },
        {
          id: 'pf-travelsWellInCar',
          type: 'choice',
          label: 'Travels well in car (dogs/other only)',
          required: false,
          options: ['yes', 'no', 'unsure'],
          mapping: { target: 'animal', path: 'travelsWellInCar' },
        },
        {
          id: 'pf-chasesLivestock',
          type: 'choice',
          label: 'Chases livestock (dogs only)',
          required: false,
          options: ['yes', 'no', 'unsure'],
          mapping: { target: 'animal', path: 'chasesLivestock' },
        },
        {
          id: 'pf-chasesLivestockDetails',
          type: 'text',
          label: 'Chases livestock -- details',
          required: false,
          mapping: { target: 'animal', path: 'chasesLivestockDetails' },
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
        },
        {
          id: 'pf-offLeadMode',
          type: 'choice',
          label: 'On lead / off lead (dogs only)',
          required: false,
          options: ['on_lead', 'off_lead'],
          mapping: { target: 'animal', path: 'offLeadConsent.mode' },
        },
        {
          id: 'pf-offLeadSignature',
          type: 'signature',
          label: 'Off-lead consent signature (dogs, off lead only)',
          required: false,
          mapping: { target: 'animal', path: 'offLeadConsent.signature' },
        },
      ],
    },
  ],
};
