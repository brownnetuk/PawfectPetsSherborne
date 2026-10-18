import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { publicFrontendUrl } from '../common/tracking-pixel.util';
import {
  EmailTemplate,
  EmailTrigger,
} from '../settings/schemas/email-template.schema';
import { NotificationService } from '../notifications/notification.service';
import { SettingsService } from '../settings/settings.service';
import { CreatePreBoardingFormDto } from './dto/create-pre-boarding-form.dto';
import { UpdatePreBoardingSettingsDto } from './dto/update-pre-boarding-settings.dto';
import {
  DEFAULT_MAX_SCORE,
  DEFAULT_PRE_BOARDING_QUESTIONS,
  isQuestionVisible,
  PreBoardingAnswer,
  PreBoardingCondition,
  PreBoardingOption,
  PreBoardingQuestion,
  PreBoardingQuestionType,
  scoreDog,
} from './pre-boarding.types';
import {
  PreBoardingForm,
  PreBoardingFormStatus,
} from './schemas/pre-boarding-form.schema';
import { PreBoardingSettings } from './schemas/pre-boarding-settings.schema';

// The first default template (Admin 1.0.155) used {{dog_names}}, which is
// no longer known when the email goes out -- an untouched copy of it is
// swapped for the current default in onModuleInit().
const PREVIOUS_DEFAULT_EMAIL_SUBJECT =
  'A few questions before {{dog_names}} boards with us';
const PREVIOUS_DEFAULT_EMAIL_BODY_SNIPPET =
  'Thanks for your interest in boarding {{dog_names}} with us.';
const DEFAULT_EMAIL_SUBJECT = 'A few questions before your dog stays with us';
const DEFAULT_EMAIL_BODY = `<div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;">
<div style="padding:8px 0 20px;">{{logo}}<strong style="font-size:1.15rem;">{{businessName}}</strong></div>
<p style="margin:0 0 16px;">Hi {{name}},</p>
<p style="margin:0 0 16px;">Thanks for your interest in boarding with us. Because dogs stay in our home, we ask every owner to fill in a short questionnaire first so we can make sure it's the right fit for your dog and for the other dogs staying with us.</p>
<p style="margin:0 0 24px;">It takes about 10 minutes. Please answer as honestly as you can, as there are no wrong answers.</p>
<p style="margin:0 0 24px;"><a href="{{link}}" style="background:#0f3a5f;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block;">Fill in the questionnaire</a></p>
<p style="margin:0 0 16px;">We'll be in touch once we've had a look at your answers.</p>
<p style="margin:0 0 16px;">Thanks,<br>{{businessName}}</p>
<p style="margin:24px 0 0;color:#6b7280;font-size:0.85rem;">{{businessName}} · {{businessAddress}}, {{businessTown}} {{businessPostcode}} · {{businessTelephone}}</p>
</div>`;

const QUESTION_TYPES: PreBoardingQuestionType[] = ['yesno', 'choice', 'text'];

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function dogCountOf(form: PreBoardingForm): number {
  return form.dogCount ?? form.dogNames.length;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Turns whatever the admin sent into a well-formed PreBoardingQuestion,
// rejecting anything that would break scoring or rendering.
function normaliseQuestion(
  raw: Record<string, unknown>,
  index: number,
  seenIds: Set<string>,
): PreBoardingQuestion {
  const id = str(raw.id).trim();
  const text = str(raw.text).trim();
  const type = raw.type as PreBoardingQuestionType;
  if (!id) throw new BadRequestException(`Question ${index + 1} has no id.`);
  if (seenIds.has(id))
    throw new BadRequestException(`Two questions share the id "${id}".`);
  if (!text)
    throw new BadRequestException(`Question ${index + 1} has no text.`);
  if (!QUESTION_TYPES.includes(type))
    throw new BadRequestException(`Question "${text}" has an unknown type.`);

  let options: PreBoardingOption[] = [];
  if (type !== 'text') {
    const rawOptions = Array.isArray(raw.options)
      ? (raw.options as Record<string, unknown>[])
      : [];
    options = rawOptions.map((o) => ({
      value: str(o.value).trim(),
      label: str(o.label).trim() || str(o.value).trim(),
      score: Math.max(0, Math.round(num(o.score))),
      askDetails: o.askDetails === true,
      autoFail: o.autoFail === true,
    }));
    if (options.length < 2)
      throw new BadRequestException(`"${text}" needs at least two answers.`);
    if (options.some((o) => !o.value))
      throw new BadRequestException(`"${text}" has an answer with no value.`);
    if (new Set(options.map((o) => o.value)).size !== options.length) {
      throw new BadRequestException(
        `"${text}" has two answers with the same value.`,
      );
    }
  }

  // Conditions may only point at earlier questions, so visibility can be
  // worked out top to bottom with no cycles.
  const showWhen: PreBoardingCondition[] = (
    Array.isArray(raw.showWhen)
      ? (raw.showWhen as Record<string, unknown>[])
      : []
  )
    .map((c) => ({ questionId: str(c.questionId), value: str(c.value) }))
    .filter((c) => c.questionId && c.value);
  for (const c of showWhen) {
    if (!seenIds.has(c.questionId)) {
      throw new BadRequestException(
        `"${text}" can only depend on a question above it.`,
      );
    }
  }

  seenIds.add(id);
  return {
    id,
    section: str(raw.section).trim() || 'General',
    text,
    type,
    options,
    detailsPrompt: str(raw.detailsPrompt).trim() || undefined,
    required: type === 'text' ? raw.required === true : raw.required !== false,
    active: raw.active !== false,
    showWhen: showWhen.length > 0 ? showWhen : undefined,
  };
}

@Injectable()
export class PreBoardingService implements OnModuleInit {
  constructor(
    @InjectModel(PreBoardingSettings.name)
    private readonly settingsModel: Model<PreBoardingSettings>,
    @InjectModel(PreBoardingForm.name)
    private readonly formModel: Model<PreBoardingForm>,
    @InjectModel(EmailTemplate.name)
    private readonly emailTemplateModel: Model<EmailTemplate>,
    private readonly settingsService: SettingsService,
    private readonly notificationService: NotificationService,
  ) {}

  // Seeds the pre_boarding email template once, so "Send email" works out
  // of the box -- staff can still edit or replace it in Settings > Email
  // Templates, and a deliberately deleted one isn't recreated until restart.
  async onModuleInit() {
    try {
      await this.emailTemplateModel
        .updateOne(
          { trigger: EmailTrigger.PRE_BOARDING },
          {
            $setOnInsert: {
              trigger: EmailTrigger.PRE_BOARDING,
              name: 'Pre-Boarding Questionnaire',
              subject: DEFAULT_EMAIL_SUBJECT,
              body: DEFAULT_EMAIL_BODY,
            },
          },
          { upsert: true },
        )
        .exec();
      await this.emailTemplateModel
        .updateOne(
          {
            trigger: EmailTrigger.PRE_BOARDING,
            subject: PREVIOUS_DEFAULT_EMAIL_SUBJECT,
            body: { $regex: escapeRegex(PREVIOUS_DEFAULT_EMAIL_BODY_SNIPPET) },
          },
          {
            $set: { subject: DEFAULT_EMAIL_SUBJECT, body: DEFAULT_EMAIL_BODY },
          },
        )
        .exec();
    } catch {
      // Not fatal: staff can still set the template up by hand.
    }
  }

  // --- settings ---

  async getSettings(): Promise<{
    maxScore: number;
    questions: PreBoardingQuestion[];
  }> {
    const doc = await this.settingsModel.findOne().exec();
    return {
      maxScore: doc?.maxScore ?? DEFAULT_MAX_SCORE,
      questions:
        (doc?.questions as unknown as PreBoardingQuestion[] | undefined) ??
        DEFAULT_PRE_BOARDING_QUESTIONS,
    };
  }

  async updateSettings(dto: UpdatePreBoardingSettingsDto) {
    const update: Record<string, unknown> = {};
    if (dto.maxScore !== undefined) update.maxScore = dto.maxScore;
    if (dto.questions !== undefined) {
      const seen = new Set<string>();
      update.questions = dto.questions.map((raw, i) =>
        normaliseQuestion(raw, i, seen),
      );
    }
    await this.settingsModel
      .findOneAndUpdate({}, update, { upsert: true })
      .exec();
    return this.getSettings();
  }

  async resetQuestions() {
    await this.settingsModel
      .findOneAndUpdate(
        {},
        { questions: DEFAULT_PRE_BOARDING_QUESTIONS },
        { upsert: true },
      )
      .exec();
    return this.getSettings();
  }

  // --- forms ---

  async create(dto: CreatePreBoardingFormDto) {
    const settings = await this.getSettings();
    const questions = settings.questions.filter((q) => q.active);
    if (questions.length === 0) {
      throw new BadRequestException(
        'There are no active questions -- add some in Settings > Pre-Boarding first.',
      );
    }
    return this.formModel.create({
      firstName: dto.firstName.trim(),
      surname: dto.surname?.trim() || undefined,
      email: dto.email.trim(),
      dogCount: dto.dogCount,
      questionsSnapshot: questions as unknown as Record<string, unknown>[],
      maxScore: settings.maxScore,
    });
  }

  findAll() {
    return this.formModel
      .find()
      .select('-questionsSnapshot -answers')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string) {
    const form = isValidObjectId(id)
      ? await this.formModel.findById(id).exec()
      : null;
    if (!form) throw new NotFoundException('Pre-boarding form not found');
    return form;
  }

  async remove(id: string): Promise<void> {
    const form = await this.findOne(id);
    await form.deleteOne();
  }

  link(id: string): string {
    return `${publicFrontendUrl()}/pre-boarding/${id}`;
  }

  async send(id: string): Promise<void> {
    const form = await this.findOne(id);
    if (form.status === PreBoardingFormStatus.COMPLETED) {
      throw new BadRequestException('This form has already been filled in.');
    }
    await this.settingsService.sendTemplatedEmail(
      EmailTrigger.PRE_BOARDING,
      form.email,
      {
        name: form.firstName,
        link: this.link(id),
        // Names aren't known until the owner fills the form in.
        dog_names:
          form.dogNames.length > 0
            ? joinNames(form.dogNames)
            : dogCountOf(form) > 1
              ? 'your dogs'
              : 'your dog',
      },
    );
    form.lastEmailedAt = new Date();
    await form.save();
  }

  // What the owner's browser gets -- never the scores or auto-fail flags,
  // so the questionnaire can't be gamed.
  async findOnePublic(id: string) {
    const form = await this.findOne(id);
    const questions = (
      form.questionsSnapshot as unknown as PreBoardingQuestion[]
    ).map((q) => ({
      id: q.id,
      section: q.section,
      text: q.text,
      type: q.type,
      required: q.required,
      detailsPrompt: q.detailsPrompt,
      showWhen: q.showWhen,
      options: q.options.map((o) => ({
        value: o.value,
        label: o.label,
        askDetails: o.askDetails,
      })),
    }));
    return {
      _id: form._id,
      firstName: form.firstName,
      dogCount: dogCountOf(form),
      dogNames: form.dogNames,
      status: form.status,
      questions,
    };
  }

  async submit(
    id: string,
    rawDogNames: string[],
    rawAnswers: Record<string, unknown>[],
  ) {
    const form = await this.findOne(id);
    if (form.status === PreBoardingFormStatus.COMPLETED) {
      throw new BadRequestException('This form has already been submitted.');
    }
    const count = dogCountOf(form);
    if (rawAnswers.length !== count || rawDogNames.length !== count) {
      throw new BadRequestException('Answers are needed for every dog.');
    }
    const dogNames = rawDogNames.map((n) => n.trim().slice(0, 100));
    if (dogNames.some((n) => !n)) {
      throw new BadRequestException("Please fill in every dog's name.");
    }
    const questions =
      form.questionsSnapshot as unknown as PreBoardingQuestion[];

    const answers = dogNames.map((dogName, dogIndex) => {
      const raw = rawAnswers[dogIndex] ?? {};
      const clean: Record<string, PreBoardingAnswer> = {};
      // Questions are walked in order so a hidden question's stale answer
      // never counts towards a later question's visibility or the score.
      for (const question of questions) {
        if (!isQuestionVisible(question, clean)) continue;
        const entry = (raw[question.id] ?? {}) as Record<string, unknown>;
        const value = str(entry.value).trim().slice(0, 5000);
        const details = str(entry.details).trim().slice(0, 5000);
        if (!value) {
          if (question.required) {
            throw new BadRequestException(
              `Please answer "${question.text.replace(/\{\{\s*dogName\s*\}\}/g, dogName)}".`,
            );
          }
          continue;
        }
        if (
          question.type !== 'text' &&
          !question.options.some((o) => o.value === value)
        ) {
          throw new BadRequestException(
            `Unrecognised answer for "${question.text}".`,
          );
        }
        const picked = question.options.find((o) => o.value === value);
        clean[question.id] =
          picked?.askDetails && details ? { value, details } : { value };
      }
      return clean;
    });

    const results = dogNames.map((dogName, i) =>
      scoreDog(questions, dogName, answers[i], form.maxScore),
    );
    form.dogNames = dogNames;
    form.answers = answers;
    form.results = results as unknown as Record<string, unknown>[];
    form.suitable = results.every((r) => r.suitable);
    form.status = PreBoardingFormStatus.COMPLETED;
    form.submittedAt = new Date();
    await form.save();
    await this.notificationService.notifyFormSubmitted(
      'Pre-boarding form',
      [form.firstName, form.surname].filter(Boolean).join(' '),
    );
    return { ok: true };
  }
}
