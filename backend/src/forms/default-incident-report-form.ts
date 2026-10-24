import { FormField } from './form-field.types';

// Seeded (idempotently) from FormsService.onModuleInit() -- built from the
// business's own "Incident Report Form" paper record, and filled in by staff
// from a Boarding & Day Care booking's Incident Reports card (as many per
// booking as needed). Like every other seeded form, staff are free to edit it
// in Settings > Forms afterwards; Settings > Boarding's "Incident report form"
// picker says which form that card uses (pointed at this one on first seed).
//
// Deliberate simplifications versus the paper form:
//  - Each numbered section is a 'display' field with startsSection, so the
//    PDF gets one card per section (without a page break between each).
//  - The ☐ Yes / ☐ No (/ ☐ N/A) boxes are single choices, and each "If yes:"
//    box only appears once Yes is picked (visibleWhen).
//  - "Dog(s) involved" lists the booking customer's own dogs (the booking's
//    dogs are pre-ticked); any other dog goes in the free-text box below it.
//  - The sign-off lines are a name, signature and date each -- the licence
//    holder's review is optional, so it can be added later by editing.
const YES_NO = ['Yes', 'No'];
const YES_NO_NA = ['Yes', 'No', 'N/A'];

export const INCIDENT_TYPES = [
  'Bite / scratch',
  'Escape / attempted escape',
  'Illness',
  'Injury',
  'Death',
  'Fire / emergency',
  'Property damage',
  'Near miss',
  'Other',
];

function section(id: string, label: string, first = false): FormField {
  return first
    ? { id, type: 'display', label, required: false }
    : { id, type: 'display', label, required: false, startsSection: true };
}

function ifYes(id: string, label: string, toggleId: string): FormField {
  return {
    id,
    type: 'textarea',
    label,
    required: false,
    visibleWhen: { mode: 'all', conditions: [{ fieldId: toggleId, equals: 'Yes' }] },
  };
}

export const DEFAULT_INCIDENT_REPORT_FORM: {
  name: string;
  description: string;
  customerVisible: boolean;
  fields: FormField[];
} = {
  name: 'Incident Report',
  description:
    'Complete as soon as possible after any incident, near miss, illness, injury, escape, or death. Supports Policy 11 (Death or Escape of an Animal Procedure), Policy 6 (Health & Welfare Monitoring), and the risk assessments (RA1-RA7). File with the Incident & Isolation Log.',
  // Staff-only -- never offered in the per-customer "Choose a form" picker.
  customerVisible: false,
  fields: [
    section('ir-detailsHeading', 'Incident details', true),
    { id: 'ir-date', type: 'date', label: 'Date of incident', required: true },
    { id: 'ir-time', type: 'time', label: 'Time of incident', required: false },
    { id: 'ir-location', type: 'text', label: 'Location (room / garden section)', required: false },
    { id: 'ir-reportedBy', type: 'text', label: 'Reported by', required: true, defaultValue: '{{staffMemberSignedIn}}' },
    { id: 'ir-type', type: 'multichoice', label: 'Type of incident', required: true, options: INCIDENT_TYPES },
    { id: 'ir-typeOther', type: 'text', label: 'If other, please specify', required: false },

    section('ir-involvedHeading', 'Who and what was involved'),
    {
      id: 'ir-dogs',
      type: 'multichoice',
      label: 'Dog(s) involved',
      required: false,
      options: [],
      optionsSource: 'customerPets',
    },
    { id: 'ir-otherDogs', type: 'textarea', label: 'Other dog(s) involved (name / owner)', required: false },
    { id: 'ir-people', type: 'textarea', label: 'Person(s) involved (name / role)', required: false },
    { id: 'ir-witnesses', type: 'textarea', label: 'Witnesses present', required: false },

    section('ir-whatHappenedHeading', 'What happened'),
    {
      id: 'ir-description',
      type: 'textarea',
      label: 'Full description (include what the dog was doing immediately before, and any known trigger)',
      required: true,
    },
    { id: 'ir-photos', type: 'file', label: 'Photos', required: false },

    section('ir-injuriesHeading', 'Injuries or harm'),
    { id: 'ir-anyoneInjured', type: 'choice', label: 'Was anyone injured?', required: false, options: YES_NO },
    ifYes('ir-injuryDetails', 'If yes: who, and nature of injury', 'ir-anyoneInjured'),
    { id: 'ir-vetNeeded', type: 'choice', label: 'Was veterinary treatment needed?', required: false, options: YES_NO },
    ifYes('ir-vetDetails', 'If yes: details (vet, treatment given)', 'ir-vetNeeded'),
    { id: 'ir-firstAid', type: 'choice', label: 'Was first aid given?', required: false, options: YES_NO },
    ifYes('ir-firstAidDetails', 'If yes: by whom, what was given', 'ir-firstAid'),

    section('ir-immediateHeading', 'Immediate action taken at the time'),
    { id: 'ir-immediateAction', type: 'textarea', label: 'What was done at the time', required: false },

    section('ir-followUpHeading', 'Follow-up actions'),
    { id: 'ir-ownerInformed', type: 'choice', label: 'Owner informed', required: false, options: YES_NO_NA },
    { id: 'ir-vetContacted', type: 'choice', label: 'Vet contacted', required: false, options: YES_NO_NA },
    {
      id: 'ir-localAuthority',
      type: 'choice',
      label: 'Local authority informed (serious incidents)',
      required: false,
      options: YES_NO_NA,
    },
    {
      id: 'ir-riddor',
      type: 'choice',
      label: 'RIDDOR reportable (staff injury - check HSE criteria)',
      required: false,
      options: YES_NO_NA,
    },
    {
      id: 'ir-riskAssessmentReviewed',
      type: 'choice',
      label: 'Relevant risk assessment reviewed / updated',
      required: false,
      options: YES_NO_NA,
    },
    ifYes('ir-riskAssessmentDetails', 'If yes: which risk assessment, and what changed', 'ir-riskAssessmentReviewed'),

    section('ir-rootCauseHeading', 'Root cause / contributing factors'),
    { id: 'ir-rootCause', type: 'textarea', label: 'Details', required: false },

    section('ir-preventiveHeading', 'Preventive actions to avoid recurrence'),
    { id: 'ir-preventiveActions', type: 'textarea', label: 'Preventive actions', required: false },
    { id: 'ir-actionOwner', type: 'text', label: 'Action owner', required: false },
    { id: 'ir-targetDate', type: 'date', label: 'Target date', required: false },

    section('ir-signOffHeading', 'Sign-off'),
    {
      id: 'ir-completedBy',
      type: 'text',
      label: 'Completed by (staff)',
      required: true,
      defaultValue: '{{staffMemberSignedIn}}',
    },
    { id: 'ir-completedSignature', type: 'signature', label: 'Staff signature', required: false },
    { id: 'ir-completedDate', type: 'date', label: 'Date', required: false },
    { id: 'ir-reviewedBy', type: 'text', label: 'Reviewed by (licence holder)', required: false },
    { id: 'ir-reviewedSignature', type: 'signature', label: 'Licence holder signature', required: false },
    { id: 'ir-reviewedDate', type: 'date', label: 'Date reviewed', required: false },
  ],
};
