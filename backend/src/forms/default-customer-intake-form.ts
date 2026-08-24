import { FormField } from './form-field.types';

// The out-of-the-box "Customer Intake" form, seeded once (idempotently) by
// FormsService.onModuleInit(). Mirrors every field the real hardcoded intake
// wizard (frontend/src/intake/) collects, mapped to the same Customer/Animal
// paths that wizard's own submission (frontend/src/api/client.ts) writes to.
//
// One deliberate simplification versus the real wizard, flagged in the
// implementation plan: medication entries aren't a fully generic
// nested-repeatable-within-a-repeatable-group (the builder doesn't support
// that) -- instead this seeded form captures a single medication entry via
// fixed-index paths (medication.medications[0].*), which
// form-submission-mapping.util.ts's path resolver supports as a pragmatic,
// narrowly-scoped exception rather than a general nested-repeat feature.
//
// Conditional visibility (visibleWhen, form-field.types.ts) *is* supported
// now (it wasn't in the original v1 plan) -- pf-lastSeasonEndDate below is
// the one field here that uses it, but the builder doesn't yet replicate
// every conditional the real wizard has (e.g. species-based show/hide for
// chasesLivestock etc.) -- those are still always shown here, same as
// before; only questions that have no meaningful answer at all when hidden
// (like this one) have been wired up.
export const DEFAULT_CUSTOMER_INTAKE_FORM: {
  name: string;
  description: string;
  fields: FormField[];
} = {
  name: 'Customer Intake',
  description:
    'The full new-customer registration form, pre-mapped to create a Customer and their pet(s). Matches the fields the public intake wizard collects.',
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
      label: 'Alarm instructions',
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
          visibleWhen: { fieldId: 'pf-neuteredStatus', equals: 'spayed' },
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
