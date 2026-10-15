import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  EmailTemplate,
  EmailTemplateSchema,
  EmailTrigger,
} from '../settings/schemas/email-template.schema';
import { PreBoardingService } from './pre-boarding.service';
import {
  PreBoardingForm,
  PreBoardingFormSchema,
} from './schemas/pre-boarding-form.schema';
import {
  PreBoardingSettings,
  PreBoardingSettingsSchema,
} from './schemas/pre-boarding-settings.schema';

// Exercises create -> public fetch -> submit -> score against a real
// in-memory MongoDB, with a small custom question set.
describe('PreBoardingService', () => {
  jest.setTimeout(120000);
  let mongod: MongoMemoryServer;
  let service: PreBoardingService;
  let emailTemplateModel: Model<EmailTemplate>;
  const sendTemplatedEmail = jest.fn().mockResolvedValue(undefined);

  const questions = [
    {
      id: 'sex',
      section: 'Basics',
      text: 'Is {{dogName}} male or female?',
      type: 'choice',
      options: [
        { value: 'male', label: 'Male', score: 0 },
        { value: 'female', label: 'Female', score: 0 },
      ],
    },
    {
      id: 'season',
      section: 'Basics',
      text: 'Could {{dogName}} come into season?',
      type: 'yesno',
      options: [
        { value: 'yes', label: 'Yes', score: 0, autoFail: true },
        { value: 'no', label: 'No', score: 0 },
      ],
      showWhen: [{ questionId: 'sex', value: 'female' }],
    },
    {
      id: 'bitten',
      section: 'Behaviour',
      text: 'Has {{dogName}} ever bitten?',
      type: 'yesno',
      options: [
        { value: 'yes', label: 'Yes', score: 6, askDetails: true },
        { value: 'no', label: 'No', score: 0 },
      ],
    },
    {
      id: 'chewing',
      section: 'Home',
      text: 'Does {{dogName}} chew?',
      type: 'yesno',
      options: [
        { value: 'yes', label: 'Yes', score: 3 },
        { value: 'no', label: 'No', score: 0 },
      ],
    },
    {
      id: 'notes',
      section: 'Home',
      text: 'Anything else?',
      type: 'text',
    },
  ];

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: PreBoardingSettings.name, schema: PreBoardingSettingsSchema },
          { name: PreBoardingForm.name, schema: PreBoardingFormSchema },
          { name: EmailTemplate.name, schema: EmailTemplateSchema },
        ]),
      ],
    }).compile();
    emailTemplateModel = moduleRef.get(getModelToken(EmailTemplate.name));
    service = new PreBoardingService(
      moduleRef.get(getModelToken(PreBoardingSettings.name)),
      moduleRef.get(getModelToken(PreBoardingForm.name)),
      emailTemplateModel,
      { sendTemplatedEmail } as never,
    );
    await service.onModuleInit();
    await service.updateSettings({ maxScore: 5, questions });
  });

  afterAll(async () => {
    await mongod.stop();
  });

  it('seeds the pre_boarding email template', async () => {
    const template = await emailTemplateModel
      .findOne({ trigger: EmailTrigger.PRE_BOARDING })
      .exec();
    expect(template?.body).toContain('{{link}}');
  });

  it('replaces an untouched copy of the old {{dog_names}} template', async () => {
    await emailTemplateModel.updateOne(
      { trigger: EmailTrigger.PRE_BOARDING },
      {
        subject: 'A few questions before {{dog_names}} boards with us',
        body: '<p>Thanks for your interest in boarding {{dog_names}} with us.</p>',
      },
    );
    await service.onModuleInit();
    const template = await emailTemplateModel
      .findOne({ trigger: EmailTrigger.PRE_BOARDING })
      .exec();
    expect(template?.subject).not.toContain('{{dog_names}}');
    expect(template?.body).not.toContain('{{dog_names}}');
  });

  it('leaves an edited template alone', async () => {
    await emailTemplateModel.updateOne(
      { trigger: EmailTrigger.PRE_BOARDING },
      { subject: 'My own subject', body: '<p>My own body</p>' },
    );
    await service.onModuleInit();
    const template = await emailTemplateModel
      .findOne({ trigger: EmailTrigger.PRE_BOARDING })
      .exec();
    expect(template?.subject).toBe('My own subject');
  });

  it('rejects a condition that points at a later question', async () => {
    await expect(
      service.updateSettings({ questions: [questions[1], questions[0]] }),
    ).rejects.toThrow('can only depend on a question above it');
  });

  it('never sends scores to the public page', async () => {
    const form = await service.create({
      firstName: 'Caroline',
      email: 'c@example.com',
      dogCount: 1,
    });
    const pub = await service.findOnePublic(String(form._id));
    expect(JSON.stringify(pub)).not.toMatch(/score|autoFail/);
  });

  it('scores each dog, ignoring hidden questions', async () => {
    const form = await service.create({
      firstName: 'Caroline',
      email: 'c@example.com',
      dogCount: 2,
    });
    const id = String(form._id);
    await service.submit(
      id,
      ['Autumn', 'Biscuit'],
      [
        // Female, not in season, chews (+3): suitable at max 5.
        {
          sex: { value: 'female' },
          season: { value: 'no' },
          bitten: { value: 'no', details: 'dropped: no details asked' },
          chewing: { value: 'yes' },
        },
        // Male with a stale "season: yes" left over -- hidden, so no auto-fail.
        // Bitten (+6) takes him over the pass mark.
        {
          sex: { value: 'male' },
          season: { value: 'yes' },
          bitten: { value: 'yes', details: 'Nipped a dog in 2024' },
          chewing: { value: 'no' },
        },
      ],
    );
    const saved = await service.findOne(id);
    const results = saved.results as unknown as {
      score: number;
      suitable: boolean;
      autoFailed: boolean;
      flags: { details?: string }[];
    }[];
    expect(results[0]).toMatchObject({
      score: 3,
      suitable: true,
      autoFailed: false,
    });
    expect(results[1]).toMatchObject({
      score: 6,
      suitable: false,
      autoFailed: false,
    });
    expect(results[1].flags[0].details).toBe('Nipped a dog in 2024');
    expect(saved.answers?.[0]).not.toHaveProperty('bitten.details');
    expect(saved.answers?.[1]).not.toHaveProperty('season');
    expect(saved.suitable).toBe(false);
    expect(saved.dogNames).toEqual(['Autumn', 'Biscuit']);
    await expect(
      service.submit(id, ['Autumn', 'Biscuit'], [{}, {}]),
    ).rejects.toThrow('already been submitted');
  });

  it('auto-fails regardless of score', async () => {
    const form = await service.create({
      firstName: 'Caroline',
      email: 'c@example.com',
      dogCount: 1,
    });
    await service.submit(
      String(form._id),
      ['Autumn'],
      [
        {
          sex: { value: 'female' },
          season: { value: 'yes' },
          bitten: { value: 'no' },
          chewing: { value: 'no' },
        },
      ],
    );
    const saved = await service.findOne(String(form._id));
    expect(saved.results?.[0]).toMatchObject({
      score: 0,
      autoFailed: true,
      suitable: false,
    });
  });

  it('requires a name for every dog', async () => {
    const form = await service.create({
      firstName: 'Caroline',
      email: 'c@example.com',
      dogCount: 2,
    });
    await expect(
      service.submit(String(form._id), ['Autumn', ' '], [{}, {}]),
    ).rejects.toThrow("every dog's name");
    await expect(
      service.submit(String(form._id), ['Autumn'], [{}, {}]),
    ).rejects.toThrow('every dog');
  });

  it('requires visible required questions', async () => {
    const form = await service.create({
      firstName: 'Caroline',
      email: 'c@example.com',
      dogCount: 1,
    });
    await expect(
      service.submit(
        String(form._id),
        ['Autumn'],
        [{ sex: { value: 'female' } }],
      ),
    ).rejects.toThrow('Could Autumn come into season?');
  });

  it('emails the link with the dog names', async () => {
    const form = await service.create({
      firstName: 'Caroline',
      email: 'c@example.com',
      dogCount: 3,
    });
    await service.send(String(form._id));
    const [trigger, to, vars] = sendTemplatedEmail.mock.lastCall as [
      EmailTrigger,
      string,
      Record<string, string>,
    ];
    expect(trigger).toBe(EmailTrigger.PRE_BOARDING);
    expect(to).toBe('c@example.com');
    expect(vars.name).toBe('Caroline');
    expect(vars.dog_names).toBe('your dogs');
    expect(vars.link).toContain(`/pre-boarding/${String(form._id)}`);
    expect(
      (await service.findOne(String(form._id))).lastEmailedAt,
    ).toBeDefined();
  });
});
