import { FormField } from './form-field.types';

// Seeded (idempotently) from FormsService.onModuleInit() -- built from the
// business's own "6. New Dog Intake Risk Assessment" (RA6) paper record, and
// filled in by staff against a customer from Boarding & Day Care > Risk
// Assessments > Customer Risk Assessments (or the customer's Forms tab). Like
// every other seeded form, staff are free to edit it in Settings > Forms
// afterwards; Settings > Boarding's "Customer risk assessment form" picker
// says which form is used (pointed at this one on first seed).
//
// Deliberate simplifications versus the paper form:
//  - Each heading is a 'display' field with startsSection, so the PDF gets
//    one card per section, the same as the Incident Report.
//  - "Dog's name" lists the customer's own dogs (more than one can be
//    assessed together), and "Owner's name" starts as the customer's name.
//  - Each section's ☐ boxes are one multi-select, so any number can be ticked.
//  - The risk score is worked out from likelihood × severity as staff fill it
//    in (admin CustomerRiskAssessmentsCard), but stays editable.
// Starts as today's date but stays editable, so an assessment done on paper
// earlier can be entered with its real date. (First seeded as a non-editable
// 'today' field -- FormsService.upgradeCustomerRiskAssessmentDate() converts
// that.)
export const CRA_DATE_FIELD: FormField = {
  id: 'cra-date',
  type: 'date',
  label: 'Date of assessment',
  required: true,
  defaultValue: '{{today}}',
};

const ONE_TO_FIVE = ['1', '2', '3', '4', '5'];

function section(id: string, label: string, first = false): FormField {
  return first
    ? { id, type: 'display', label, required: false }
    : { id, type: 'display', label, required: false, startsSection: true };
}

export const DEFAULT_CUSTOMER_RISK_ASSESSMENT_FORM: {
  name: string;
  description: string;
  customerVisible: boolean;
  fields: FormField[];
} = {
  name: 'New Dog Intake Risk Assessment',
  description:
    'Complete for every new dog before or on arrival. Supports Policy 5 (Disease Prevention & Isolation) and Policy 9 (New Dog Introduction).',
  // Staff-only -- never offered in the per-customer "Choose a form" picker.
  customerVisible: false,
  fields: [
    section('cra-dogHeading', 'Dog details', true),
    {
      id: 'cra-dogs',
      type: 'multichoice',
      label: "Dog's name",
      required: true,
      options: [],
      optionsSource: 'customerPets',
    },
    { id: 'cra-ownerName', type: 'text', label: "Owner's name", required: false, defaultValue: '{{customerName}}' },
    { id: 'cra-arrivalDate', type: 'date', label: 'Arrival date', required: false },

    section('cra-behaviourHeading', 'Behavioural history'),
    {
      id: 'cra-behaviour',
      type: 'multichoice',
      label: 'Tick all that apply',
      required: false,
      options: [
        'Behavioural history known and provided by owner',
        'Unknown / limited behavioural history — treat as higher risk until observed',
        'Known reactivity to other dogs, people, or specific triggers (detail below)',
      ],
    },
    { id: 'cra-behaviourDetails', type: 'textarea', label: 'Details / known triggers', required: false },

    section('cra-healthHeading', 'Health & vaccination status'),
    {
      id: 'cra-health',
      type: 'multichoice',
      label: 'Tick all that apply',
      required: false,
      options: [
        'Vaccination record seen and primary course completed 2+ weeks ago',
        'Vaccination status unclear or unconfirmed — vet advice sought before mixing with other dogs',
        'Visible signs of illness or injury on arrival',
      ],
    },
    { id: 'cra-healthDetails', type: 'textarea', label: 'Details', required: false },

    section('cra-handlingHeading', 'Handling & escape risk'),
    {
      id: 'cra-handling',
      type: 'multichoice',
      label: 'Tick all that apply',
      required: false,
      options: [
        'Dog handled calmly on arrival; no signs of fear-based aggression',
        'Recall / lead manners unknown — extra caution during handover and settling-in',
        'Microchip checked and details current',
      ],
    },

    section('cra-ratingHeading', 'Risk rating & action'),
    { id: 'cra-likelihood', type: 'choice', label: 'Likelihood (1–5, see matrix)', required: true, options: ONE_TO_FIVE },
    { id: 'cra-severity', type: 'choice', label: 'Severity (1–5, see matrix)', required: true, options: ONE_TO_FIVE },
    { id: 'cra-riskScore', type: 'number', label: 'Risk score (Likelihood × Severity)', required: false },
    {
      id: 'cra-action',
      type: 'textarea',
      label: 'Action needed before this dog is left with a single handler or mixed with others',
      required: false,
    },

    section('cra-signOffHeading', 'Sign-off'),
    { id: 'cra-assessedBy', type: 'text', label: 'Assessed by', required: true, defaultValue: '{{staffMemberSignedIn}}' },
    { id: 'cra-signature', type: 'signature', label: 'Signature', required: false },
    CRA_DATE_FIELD,
  ],
};
