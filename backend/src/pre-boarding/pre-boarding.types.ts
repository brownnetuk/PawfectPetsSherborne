// The shape of PreBoardingSettings.questions (and each PreBoardingForm's
// questionsSnapshot) -- stored as a loosely-validated Mixed array, same
// technique as Form.fields, but interpreted server-side here for scoring.

export type PreBoardingQuestionType = 'yesno' | 'choice' | 'text';

export interface PreBoardingOption {
  // What's stored as the answer ('yes'/'no' for a yesno question).
  value: string;
  label: string;
  // Concern points added to the dog's total when this answer is picked --
  // 0 means "no concern". A dog is fit for boarding when its total is at or
  // below PreBoardingSettings.maxScore and no autoFail answer was picked.
  score: number;
  // Shows a "please give details" box when this answer is picked.
  askDetails: boolean;
  // Picking this answer marks the dog as not suitable regardless of score.
  autoFail: boolean;
}

// Only show the question when every condition matches another question's
// answer for the same dog (e.g. "Could she come into season?" only when
// sex = female and spayed = no). Conditions only point at earlier questions.
export interface PreBoardingCondition {
  questionId: string;
  value: string;
}

export interface PreBoardingQuestion {
  id: string;
  section: string;
  // May contain {{dogName}}, swapped for each dog's name on the form.
  text: string;
  type: PreBoardingQuestionType;
  // Empty for 'text' questions (free text, never scored).
  options: PreBoardingOption[];
  // Label for the details box -- defaults to "Please give details".
  detailsPrompt?: string;
  required: boolean;
  // Inactive questions stay in Settings but aren't put on new forms.
  active: boolean;
  showWhen?: PreBoardingCondition[];
}

export interface PreBoardingAnswer {
  value: string;
  details?: string;
}

export interface PreBoardingDogResult {
  dogName: string;
  score: number;
  autoFailed: boolean;
  // Question text (with the dog's name filled in) for every answer that
  // added points or auto-failed -- what staff need to read first.
  flags: {
    question: string;
    answer: string;
    score: number;
    autoFail: boolean;
    details?: string;
  }[];
  suitable: boolean;
}

export const DEFAULT_MAX_SCORE = 10;

function yesNo(
  yes: Partial<PreBoardingOption>,
  no: Partial<PreBoardingOption> = {},
): PreBoardingOption[] {
  return [
    {
      value: 'yes',
      label: 'Yes',
      score: 0,
      askDetails: false,
      autoFail: false,
      ...yes,
    },
    {
      value: 'no',
      label: 'No',
      score: 0,
      askDetails: false,
      autoFail: false,
      ...no,
    },
  ];
}

function option(
  value: string,
  label: string,
  extra: Partial<PreBoardingOption> = {},
): PreBoardingOption {
  return {
    value,
    label,
    score: 0,
    askDetails: false,
    autoFail: false,
    ...extra,
  };
}

function q(
  id: string,
  section: string,
  text: string,
  type: PreBoardingQuestionType,
  options: PreBoardingOption[] = [],
  extra: Partial<PreBoardingQuestion> = {},
): PreBoardingQuestion {
  return {
    id,
    section,
    text,
    type,
    options,
    required: type !== 'text',
    active: true,
    ...extra,
  };
}

const BASICS = 'Basic eligibility';
const HEALTH = 'Health';
const BEHAVIOUR = 'Behaviour and safety';
const HOME = 'Living in our home';
const ENERGY = 'Energy, walks and garden';
const SETTLING = 'Settling and history';
const CARE = 'Care needs';

// Seeded into Settings > Pre-Boarding the first time it's opened. Scores are
// a starting point for staff to tune, not policy.
export const DEFAULT_PRE_BOARDING_QUESTIONS: PreBoardingQuestion[] = [
  // Basic eligibility
  q('sex', BASICS, 'Is {{dogName}} male or female?', 'choice', [
    option('male', 'Male'),
    option('female', 'Female'),
  ]),
  q(
    'neutered',
    BASICS,
    'Is {{dogName}} neutered or spayed?',
    'yesno',
    yesNo({}),
  ),
  q(
    'entire_male_6m',
    BASICS,
    'Is {{dogName}} over 6 months old?',
    'yesno',
    yesNo({ score: 4, askDetails: true }),
    {
      detailsPrompt:
        'Any plans to neuter, and how does he behave around other males?',
      showWhen: [
        { questionId: 'sex', value: 'male' },
        { questionId: 'neutered', value: 'no' },
      ],
    },
  ),
  q(
    'season_during_stay',
    BASICS,
    'Could {{dogName}} come into season during the stay?',
    'yesno',
    yesNo({ autoFail: true }),
    {
      showWhen: [
        { questionId: 'sex', value: 'female' },
        { questionId: 'neutered', value: 'no' },
      ],
    },
  ),
  q(
    'pregnant',
    BASICS,
    'Is {{dogName}} pregnant, or could she be?',
    'yesno',
    yesNo({ autoFail: true }),
    {
      showWhen: [
        { questionId: 'sex', value: 'female' },
        { questionId: 'neutered', value: 'no' },
      ],
    },
  ),
  q(
    'puppy_vaccines',
    BASICS,
    'Has {{dogName}} completed their full course of puppy vaccinations?',
    'yesno',
    yesNo({}, { autoFail: true }),
  ),
  q('weight', BASICS, 'Roughly how much does {{dogName}} weigh (kg)?', 'text'),

  // Health
  q(
    'kennel_cough',
    HEALTH,
    'Is {{dogName}} vaccinated against kennel cough?',
    'yesno',
    yesNo({ askDetails: true }, { score: 5 }),
    {
      detailsPrompt: 'Date of last kennel cough vaccine',
    },
  ),
  q(
    'flea_worm',
    HEALTH,
    'Is {{dogName}} up to date with flea and worming treatment?',
    'yesno',
    yesNo({ askDetails: true }, { score: 3 }),
    {
      detailsPrompt: 'Dates of last flea and worming treatment',
    },
  ),
  q(
    'recent_illness',
    HEALTH,
    'Has {{dogName}} had vomiting, diarrhoea, coughing or any infectious illness in the last 2 weeks?',
    'yesno',
    yesNo({ autoFail: true, askDetails: true }),
  ),
  q(
    'recent_surgery',
    HEALTH,
    'Has {{dogName}} had any surgery or injury in the last 3 months?',
    'yesno',
    yesNo({ score: 2, askDetails: true }),
  ),
  q(
    'conditions',
    HEALTH,
    'Does {{dogName}} have any ongoing conditions (e.g. epilepsy, diabetes, heart problems, arthritis)?',
    'yesno',
    yesNo({ score: 2, askDetails: true }),
  ),
  q(
    'vet_restriction',
    HEALTH,
    "Has a vet ever advised that {{dogName}} shouldn't mix with other dogs or exercise normally?",
    'yesno',
    yesNo({ score: 5, askDetails: true }),
  ),
  q(
    'mobility',
    HEALTH,
    'Does {{dogName}} have any mobility issues (stairs, getting in the car, long walks)?',
    'yesno',
    yesNo({ score: 1, askDetails: true }),
  ),

  // Behaviour and safety
  q(
    'bitten',
    BEHAVIOUR,
    'Has {{dogName}} ever bitten or nipped a person or another dog?',
    'yesno',
    yesNo({ score: 6, askDetails: true }),
    {
      detailsPrompt: 'What happened, and when?',
    },
  ),
  q(
    'asked_to_leave',
    BEHAVIOUR,
    'Has {{dogName}} ever been asked to leave a daycare, kennel or boarder?',
    'yesno',
    yesNo({ score: 6, askDetails: true }),
  ),
  q(
    'guarding',
    BEHAVIOUR,
    'Does {{dogName}} guard food, toys, beds or people?',
    'yesno',
    yesNo({ score: 3, askDetails: true }),
  ),
  q(
    'other_dogs',
    BEHAVIOUR,
    'How does {{dogName}} get on with other dogs?',
    'choice',
    [
      option('good', 'Good with all dogs'),
      option('selective', 'Selective (some dogs only)', {
        score: 2,
        askDetails: true,
      }),
      option('poor', "Doesn't get on with other dogs", {
        score: 6,
        askDetails: true,
      }),
    ],
  ),
  q(
    'cats',
    BEHAVIOUR,
    'Does {{dogName}} chase cats, squirrels or small pets?',
    'yesno',
    yesNo({ score: 2, askDetails: true }),
  ),
  q(
    'reactive_lead',
    BEHAVIOUR,
    'Is {{dogName}} reactive on the lead (barking or lunging at dogs, people or traffic)?',
    'yesno',
    yesNo({ score: 2, askDetails: true }),
  ),
  q(
    'escape',
    BEHAVIOUR,
    'Is {{dogName}} an escape risk (jumps or climbs fences, digs, bolts through doors)?',
    'yesno',
    yesNo({ score: 4, askDetails: true }),
  ),
  q('recall', BEHAVIOUR, "How reliable is {{dogName}}'s recall?", 'choice', [
    option('reliable', 'Reliable'),
    option('mostly', 'Mostly reliable', { score: 1 }),
    option('unreliable', 'Unreliable', { score: 2 }),
  ]),
  q(
    'fears',
    BEHAVIOUR,
    'Does {{dogName}} have any fears or triggers (fireworks, thunder, men, hats, being handled)?',
    'yesno',
    yesNo({ score: 1, askDetails: true }),
  ),
  q(
    'handling',
    BEHAVIOUR,
    'Is {{dogName}} happy to be handled (paws, ears, mouth, towel-drying)?',
    'yesno',
    yesNo({}, { score: 2, askDetails: true }),
  ),

  // Living in our home
  q(
    'settle_overnight',
    HOME,
    'Does {{dogName}} settle overnight in a new place?',
    'choice',
    [
      option('yes', 'Yes, settles well'),
      option('sometimes', 'Takes a night or two', { score: 1 }),
      option('no', 'No, barks or howls at night', {
        score: 3,
        askDetails: true,
      }),
    ],
  ),
  q(
    'sleep_with_person',
    HOME,
    'Does {{dogName}} need to sleep in the same room as a person?',
    'yesno',
    yesNo({ score: 1, askDetails: true }),
  ),
  q(
    'night_toilet',
    HOME,
    'Does {{dogName}} wake in the night needing to go out?',
    'yesno',
    yesNo({ score: 1 }),
  ),
  q(
    'house_trained',
    HOME,
    'Is {{dogName}} fully house trained?',
    'yesno',
    yesNo({}, { score: 4, askDetails: true }),
  ),
  q(
    'marking',
    HOME,
    'Does {{dogName}} mark indoors, especially in a new house or around other dogs?',
    'yesno',
    yesNo({ score: 3, askDetails: true }),
  ),
  q(
    'chewing',
    HOME,
    'Does {{dogName}} chew or destroy things (furniture, shoes, cables, bedding)?',
    'yesno',
    yesNo({ score: 3, askDetails: true }),
  ),
  q(
    'swallowing',
    HOME,
    "Does {{dogName}} swallow things they shouldn't (socks, toys, stones)?",
    'yesno',
    yesNo({ score: 2, askDetails: true }),
  ),
  q(
    'children',
    HOME,
    'How does {{dogName}} behave around children?',
    'choice',
    [
      option('good', 'Calm and gentle'),
      option('excitable', 'Excitable or jumps up', {
        score: 1,
        askDetails: true,
      }),
      option('nervous', 'Nervous or avoids them', {
        score: 2,
        askDetails: true,
      }),
      option('unknown', 'Not sure / rarely meets children', { score: 1 }),
      option('incident', 'Has growled, snapped or nipped at a child', {
        score: 6,
        askDetails: true,
      }),
    ],
  ),
  q(
    'barking',
    HOME,
    'Does {{dogName}} bark a lot when unsettled?',
    'yesno',
    yesNo({ score: 1 }),
  ),
  q(
    'lived_with_dogs',
    HOME,
    'Is {{dogName}} used to living with other dogs?',
    'yesno',
    yesNo({}, { score: 1 }),
  ),
  q(
    'furniture',
    HOME,
    'Is {{dogName}} allowed on furniture or beds at home?',
    'yesno',
    yesNo({}),
  ),

  // Energy, walks and garden
  q(
    'exercise',
    ENERGY,
    'How much exercise does {{dogName}} need each day?',
    'text',
  ),
  q(
    'pulls',
    ENERGY,
    'Does {{dogName}} pull hard on the lead?',
    'yesno',
    yesNo({ score: 1 }),
  ),
  q(
    'scavenging',
    ENERGY,
    'Does {{dogName}} scavenge on walks, eat poo, or eat plants and stones?',
    'yesno',
    yesNo({ score: 1, askDetails: true }),
  ),
  q(
    'counter_surfing',
    ENERGY,
    'Does {{dogName}} steal food from worktops or tables?',
    'yesno',
    yesNo({ score: 1 }),
  ),

  // Settling and history
  q(
    'owned_6m',
    SETTLING,
    'Have you owned {{dogName}} for more than 6 months?',
    'yesno',
    yesNo({}, { score: 2, askDetails: true }),
    {
      detailsPrompt: 'What do you know about their history?',
    },
  ),
  q(
    'stayed_away',
    SETTLING,
    'Has {{dogName}} stayed away from home before (boarding, kennels, sitter)?',
    'yesno',
    yesNo({ askDetails: true }, { score: 1 }),
    {
      detailsPrompt: 'How did they cope?',
    },
  ),
  q(
    'recent_changes',
    SETTLING,
    'Any recent big changes (house move, new baby, loss of another pet)?',
    'yesno',
    yesNo({ score: 1, askDetails: true }),
  ),
  q(
    'visitors',
    SETTLING,
    'How does {{dogName}} react to visitors and the doorbell?',
    'text',
  ),
  q(
    'stress_signs',
    SETTLING,
    'What does {{dogName}} do when stressed, and what helps settle them?',
    'text',
  ),
  q(
    'meet_greet',
    SETTLING,
    'Would you be happy to do a meet and greet or trial day before the first stay?',
    'yesno',
    yesNo({}, { score: 2 }),
  ),

  // Care needs
  q(
    'raw_fed',
    CARE,
    'Is {{dogName}} raw fed?',
    'yesno',
    yesNo({ askDetails: true }),
  ),
  q(
    'grooming',
    CARE,
    'Does {{dogName}} need any grooming, bathing or ear/eye cleaning during the stay?',
    'yesno',
    yesNo({ askDetails: true }),
  ),
  q(
    'water',
    CARE,
    'Is {{dogName}} likely to jump into ponds or rivers?',
    'yesno',
    yesNo({}),
  ),
];

export function fillDogName(text: string, dogName: string): string {
  return text.replace(/\{\{\s*dogName\s*\}\}/g, dogName);
}

export function isQuestionVisible(
  question: PreBoardingQuestion,
  answers: Record<string, PreBoardingAnswer | undefined>,
): boolean {
  if (!question.showWhen || question.showWhen.length === 0) return true;
  return question.showWhen.every(
    (c) => answers[c.questionId]?.value === c.value,
  );
}

export function scoreDog(
  questions: PreBoardingQuestion[],
  dogName: string,
  answers: Record<string, PreBoardingAnswer | undefined>,
  maxScore: number,
): PreBoardingDogResult {
  let score = 0;
  let autoFailed = false;
  const flags: PreBoardingDogResult['flags'] = [];
  for (const question of questions) {
    if (question.type === 'text' || !isQuestionVisible(question, answers))
      continue;
    const answer = answers[question.id];
    const picked = question.options.find((o) => o.value === answer?.value);
    if (!picked) continue;
    score += picked.score;
    if (picked.autoFail) autoFailed = true;
    if (picked.score > 0 || picked.autoFail) {
      flags.push({
        question: fillDogName(question.text, dogName),
        answer: picked.label,
        score: picked.score,
        autoFail: picked.autoFail,
        details: answer?.details || undefined,
      });
    }
  }
  return {
    dogName,
    score,
    autoFailed,
    flags,
    suitable: !autoFailed && score <= maxScore,
  };
}
