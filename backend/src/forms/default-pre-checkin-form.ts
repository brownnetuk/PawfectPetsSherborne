import { FormField } from './form-field.types';

// Seeded (idempotently, alongside the other default forms) by
// FormsService.onModuleInit(). Sent by BoardingBookingsService.sendPreCheckIn()
// ahead of a stay (manually, or via the preCheckInDaysBefore cron) -- that's
// also where this form's content gets shaped for the specific booking it's
// sent for:
//  - {{bookingReference}} in pc-bookingRef's label is substituted with the
//    real reference (not one of form-placeholders.util.ts's customer
//    tokens -- a booking has no customer-record analog, so this is resolved
//    locally in sendPreCheckIn() instead of the general placeholder pipeline).
//  - The "Pet" group's minRepeats/maxRepeats/repetitionLabels are resized to
//    exactly the animals on that booking (same "fixed set, no add/remove"
//    shape FormSubmissionsService's wrapFieldsForPets() already uses for a
//    multi-pet send elsewhere), so only those pets show -- never the
//    customer's other pets, and never an open-ended "+ Add another".
//  - Every mapped field's answer is pre-filled from the customer's/each
//    booking animal's current record, so this reads as "please review and
//    correct" rather than "please retype everything" -- sendPreCheckIn()
//    walks this same field list against the live Customer/Animal documents
//    to build that initial answers object.
//
// Every "Client details"/"Emergency contact"/"Emergency vet" field is mapped
// (target: 'customer') exactly as Customer Intake maps them, so
// FormSubmissionsService.submit()'s existing customersService.update() path
// (already applies a mapped-field patch onto an EXISTING customer whenever
// submission.customer is set, which it always is here) keeps the customer
// record in sync with whatever the customer edits on this form -- no new
// backend logic needed for that half. The "Pet" group is createsAnimal:false
// (this never creates a new pet record) but its fields ARE mapped
// (target: 'animal') -- submit() has a matching new code path for exactly
// this shape: createsAnimal:false + animal-mapped fields + a submission
// already tied to real animals (see form-submissions.service.ts) patches
// each existing Animal instead of the usual "false = just capture as raw
// answers, no record touched" behaviour check-in/check-out's own
// createsAnimal:false pet groups get (their fields are all unmapped, so
// that new path is a no-op for them).
//
// The three consent toggles plus signature/typed-name deliberately aren't
// mapped to Customer.agreement.* -- that sub-document is the ORIGINAL
// registration agreement (signedAt is effectively "when they first signed
// up"); resending a pre-check-in ahead of every future stay would otherwise
// overwrite that historical record. This stay-specific consent is kept as
// plain submission answers only (visible in the admin's submission view/PDF),
// same as e.g. check-in's "Consent forms completed" toggle.
export const DEFAULT_PRE_CHECKIN_FORM: {
  name: string;
  description: string;
  fields: FormField[];
} = {
  name: 'Pre-Check-In',
  description:
    'Sent ahead of a boarding or day care stay so we can confirm your details and any changes before drop-off.',
  fields: [
    {
      id: 'pc-bookingRef',
      type: 'display',
      label: 'Booking reference: {{bookingReference}}',
      required: false,
    },

    {
      id: 'pc-firstName',
      type: 'text',
      label: 'First name',
      required: true,
      mapping: { target: 'customer', path: 'firstName' },
    },
    {
      id: 'pc-surname',
      type: 'text',
      label: 'Surname',
      required: false,
      mapping: { target: 'customer', path: 'surname' },
    },
    {
      id: 'pc-address1',
      type: 'text',
      label: 'Address line 1',
      required: true,
      mapping: { target: 'customer', path: 'address1' },
    },
    {
      id: 'pc-address2',
      type: 'text',
      label: 'Address line 2',
      required: false,
      mapping: { target: 'customer', path: 'address2' },
    },
    {
      id: 'pc-town',
      type: 'text',
      label: 'Town',
      required: true,
      mapping: { target: 'customer', path: 'town' },
    },
    {
      id: 'pc-county',
      type: 'text',
      label: 'County',
      required: false,
      mapping: { target: 'customer', path: 'county' },
    },
    {
      id: 'pc-postcode',
      type: 'text',
      label: 'Postcode',
      required: true,
      mapping: { target: 'customer', path: 'postcode' },
    },
    {
      id: 'pc-phoneNumber',
      type: 'text',
      label: 'Phone number',
      required: true,
      mapping: { target: 'customer', path: 'phoneNumber' },
    },
    {
      id: 'pc-email',
      type: 'text',
      label: 'Email',
      required: true,
      mapping: { target: 'customer', path: 'email' },
    },

    {
      id: 'pc-ec-sameAsClient',
      type: 'toggle',
      label: 'Emergency contact same as client',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.sameAsClient' },
    },
    {
      id: 'pc-ec-firstName',
      type: 'text',
      label: 'Emergency contact first name',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.firstName' },
    },
    {
      id: 'pc-ec-surname',
      type: 'text',
      label: 'Emergency contact surname',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.surname' },
    },
    {
      id: 'pc-ec-address1',
      type: 'text',
      label: 'Emergency contact address line 1',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.address1' },
    },
    {
      id: 'pc-ec-address2',
      type: 'text',
      label: 'Emergency contact address line 2',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.address2' },
    },
    {
      id: 'pc-ec-town',
      type: 'text',
      label: 'Emergency contact town',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.town' },
    },
    {
      id: 'pc-ec-county',
      type: 'text',
      label: 'Emergency contact county',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.county' },
    },
    {
      id: 'pc-ec-postcode',
      type: 'text',
      label: 'Emergency contact postcode',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.postcode' },
    },
    {
      id: 'pc-ec-phoneNumber',
      type: 'text',
      label: 'Emergency contact phone number',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.phoneNumber' },
    },
    {
      id: 'pc-ec-email',
      type: 'text',
      label: 'Emergency contact email',
      required: false,
      mapping: { target: 'customer', path: 'emergencyContact.email' },
    },

    {
      id: 'pc-ev-practiceName',
      type: 'text',
      label: 'Emergency vet practice name',
      required: true,
      mapping: { target: 'customer', path: 'emergencyVet.practiceName' },
    },
    {
      id: 'pc-ev-address1',
      type: 'text',
      label: 'Emergency vet address line 1',
      required: true,
      mapping: { target: 'customer', path: 'emergencyVet.address1' },
    },
    {
      id: 'pc-ev-address2',
      type: 'text',
      label: 'Emergency vet address line 2',
      required: false,
      mapping: { target: 'customer', path: 'emergencyVet.address2' },
    },
    {
      id: 'pc-ev-town',
      type: 'text',
      label: 'Emergency vet town',
      required: true,
      mapping: { target: 'customer', path: 'emergencyVet.town' },
    },
    {
      id: 'pc-ev-county',
      type: 'text',
      label: 'Emergency vet county',
      required: false,
      mapping: { target: 'customer', path: 'emergencyVet.county' },
    },
    {
      id: 'pc-ev-postcode',
      type: 'text',
      label: 'Emergency vet postcode',
      required: true,
      mapping: { target: 'customer', path: 'emergencyVet.postcode' },
    },
    {
      id: 'pc-ev-telephone',
      type: 'text',
      label: 'Emergency vet telephone',
      required: true,
      mapping: { target: 'customer', path: 'emergencyVet.telephone' },
    },
    {
      id: 'pc-ev-email',
      type: 'text',
      label: 'Emergency vet email',
      required: false,
      mapping: { target: 'customer', path: 'emergencyVet.email' },
    },

    {
      id: 'pc-pets',
      type: 'group',
      label: 'Pet',
      required: false,
      repeatable: true,
      // Resized to exactly this booking's animals (minRepeats === maxRepeats
      // === animal count, repetitionLabels === their names) by
      // BoardingBookingsService.sendPreCheckIn() -- these are just the
      // as-authored fallback if this form is ever previewed/sent outside
      // that flow.
      minRepeats: 1,
      createsAnimal: false,
      fields: [
        {
          id: 'pc-pet-vaccinated',
          type: 'toggle',
          label: 'Vaccinated',
          required: false,
          mapping: { target: 'animal', path: 'vaccinated' },
        },
        {
          id: 'pc-pet-vaccineExpiryDate',
          type: 'date',
          label: 'Vaccine expiry date',
          required: false,
          mapping: { target: 'animal', path: 'vaccineExpiryDate' },
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pc-pet-vaccinated', equals: 'true' }] },
        },
        {
          id: 'pc-pet-allergiesStatus',
          type: 'choice',
          label: 'Allergies / intolerances',
          required: true,
          options: ['yes', 'no', 'unsure'],
          mapping: { target: 'animal', path: 'allergies.status' },
        },
        {
          id: 'pc-pet-allergiesDetails',
          type: 'text',
          label: 'Allergy details',
          required: false,
          mapping: { target: 'animal', path: 'allergies.details' },
        },
        {
          id: 'pc-pet-onMedication',
          type: 'toggle',
          label: 'On medication',
          required: true,
          mapping: { target: 'animal', path: 'medication.onMedication' },
        },
        {
          id: 'pc-pet-medicationName',
          type: 'text',
          label: 'Medication name',
          required: false,
          mapping: { target: 'animal', path: 'medication.medications[0].name' },
        },
        {
          id: 'pc-pet-medicationDetails',
          type: 'textarea',
          label: 'Medication details (dosage, frequency)',
          required: false,
          mapping: { target: 'animal', path: 'medication.medications[0].additionalInfo' },
        },
        {
          id: 'pc-pet-medicationVetPrescribed',
          type: 'toggle',
          label: 'Medication vet prescribed',
          required: false,
          mapping: { target: 'animal', path: 'medication.medications[0].vetPrescribed' },
        },
        {
          id: 'pc-pet-medicationAdministeredByUs',
          type: 'toggle',
          label: 'To be administered by our staff during the stay',
          required: false,
          mapping: { target: 'animal', path: 'medication.medications[0].administeredByPawfectPets' },
        },
        {
          id: 'pc-pet-temperamentNotes',
          type: 'textarea',
          label: 'Temperament notes',
          required: false,
          mapping: { target: 'animal', path: 'temperamentNotes' },
        },
        {
          id: 'pc-pet-boardingHeading',
          type: 'display',
          label: 'Boarding-specific questions',
          required: false,
        },
        {
          id: 'pc-pet-symptoms',
          type: 'toggle',
          label: 'Has your pet displayed any new symptoms of illness, stomach upset, coughing, or general unwellness?',
          required: false,
        },
        {
          id: 'pc-pet-symptomsDetails',
          type: 'textarea',
          label: 'Please give details',
          required: false,
          visibleWhen: { mode: 'all', conditions: [{ fieldId: 'pc-pet-symptoms', equals: 'true' }] },
        },
      ],
    },

    {
      id: 'pc-consentHeading',
      type: 'display',
      label: 'Additional consent -- please confirm the following:',
      required: false,
    },
    {
      id: 'pc-consentAccurate',
      type: 'toggle',
      label: "I confirm the details given on this form are accurate, and I am the dog's owner or authorised to act on the owner's behalf.",
      required: true,
    },
    {
      id: 'pc-consentTerms',
      type: 'toggle',
      label: "I agree to the boarding provider's Terms & Conditions and cancellation policy.",
      required: true,
    },
    {
      id: 'pc-consentFamiliarisation',
      type: 'toggle',
      label: 'I consent to my dog being boarded alongside dogs from other households, following a supervised familiarisation session.',
      required: true,
    },
    {
      id: 'pc-consentSignedName',
      type: 'text',
      label: 'Signed by (full name)',
      required: true,
    },
    {
      id: 'pc-consentSignature',
      type: 'signature',
      label: 'Signature',
      required: true,
    },
    {
      id: 'pc-consentDate',
      type: 'today',
      label: 'Date',
      required: false,
    },
  ],
};
