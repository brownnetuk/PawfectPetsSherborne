import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OmitType } from '@nestjs/mapped-types';
import { InjectModel } from '@nestjs/mongoose';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import type { Request } from 'express';
import { Model } from 'mongoose';
import { actorFromRequest } from '../auth/actor.util';
import { AnimalsService } from '../animals/animals.service';
import { CreateAnimalDto } from '../animals/dto/create-animal.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import { CustomersService } from '../customers/customers.service';
import { CreateCustomerDto } from '../customers/dto/create-customer.dto';
import { UpdateCustomerDto } from '../customers/dto/update-customer.dto';
import { FormField } from '../forms/form-field.types';
import { buildCustomerPlaceholders, interpolatePlaceholders } from '../forms/form-placeholders.util';
import { FormsService } from '../forms/forms.service';
import { EmailTrigger } from '../settings/schemas/email-template.schema';
import { SettingsService } from '../settings/settings.service';
import { CreateFormSubmissionDto } from './dto/create-form-submission.dto';
import { SendFormSubmissionCopyDto } from './dto/send-form-submission-copy.dto';
import { UpdateFormSubmissionDto } from './dto/update-form-submission.dto';
import {
  buildAnimalPatch,
  buildCustomerPatch,
  validateAnimalBusinessRules,
} from './form-submission-mapping.util';
import {
  FormSubmission,
  FormSubmissionStatus,
} from './schemas/form-submission.schema';

// customer is assigned separately at write time (only known once the
// customer record itself has been created/resolved), so it can't be part of
// what gets validated here -- same OmitType technique PublicUpdateAnimalDto
// already uses, for the same reason (nothing here should be able to supply
// its own `customer`).
class ValidateAnimalDto extends OmitType(CreateAnimalDto, [
  'customer',
] as const) {}

function flattenValidationErrors(errors: ValidationError[]): string {
  const messages: string[] = [];
  const walk = (errs: ValidationError[]) => {
    for (const err of errs) {
      if (err.constraints) messages.push(...Object.values(err.constraints));
      if (err.children?.length) walk(err.children);
    }
  };
  walk(errors);
  return messages.length
    ? messages.join('; ')
    : 'This submission is incomplete or invalid.';
}

// Prepares a form's field snapshot for the unauthenticated fill page: strips
// internal field-mapping details (not a hard security boundary -- submit()
// re-validates everything server-side regardless, just no reason to leak
// Customer/Animal DB path names to the public), substitutes {{token}}
// placeholders into every field's label and (for text/textarea/number/date)
// its defaultValue (form-placeholders.util.ts -- same idea as the intake
// form's {{petName}} substitution, just with more tokens), and resolves a
// 'customerPets' choice/multichoice field's `options` to the recipient's
// real pet names. `placeholders`/`petNames` are both empty when the
// submission has no known customer yet (a brand-new lead), which resolves
// every token to '' and every dynamic dropdown to no options -- an accepted
// limitation of sending a form ahead of picking a real customer, same
// tradeoff email templates already have for {{name}} etc. on an
// unaddressed send.
function resolveFieldsForRecipient(
  fields: FormField[],
  placeholders: Record<string, string>,
  petNames: string[],
): Omit<FormField, 'mapping'>[] {
  return fields.map((field) => {
    const copy = { ...field } as Record<string, unknown>;
    delete copy.mapping;
    // optionsSource ('static'|'customerPets') is kept, unlike mapping above --
    // it's not a DB path name to hide, and the admin's staff-facing
    // FormFillModal reads it to know which repeatable group's fields
    // represent "which pet", so it can pre-populate one repetition per pet
    // already known from context (e.g. the booking this form was opened
    // from) instead of starting empty.
    copy.label = interpolatePlaceholders(field.label, placeholders);
    if (
      (field.type === 'text' || field.type === 'textarea' || field.type === 'number' || field.type === 'date') &&
      field.defaultValue
    ) {
      copy.defaultValue = interpolatePlaceholders(field.defaultValue, placeholders);
    }
    if (field.type === 'choice' || field.type === 'multichoice') {
      if (field.optionsSource === 'customerPets') {
        copy.options = petNames;
      }
    }
    if (field.type === 'group') {
      copy.fields = resolveFieldsForRecipient(field.fields, placeholders, petNames);
    }
    return copy as unknown as Omit<FormField, 'mapping' | 'optionsSource'>;
  });
}

// Merges a form's own fields into one repeated "per pet" section, one
// repetition per name in `petNames` (same order), for a submission
// covering several of a customer's pets at once (SendFormModal's multi-
// select) -- so staff send one link instead of one per pet. A field that's
// already a repeatable group, or mapped to the customer (the only mapping
// target a top-level field can have -- see form-field.types.ts), is left
// outside the repeated section unchanged: a pet-creation group has its own
// independent repeat/mapping semantics unrelated to this, and customer info
// shouldn't be asked once per pet. Everything else (the common case: plain,
// unmapped fields like "Name of pet"/"Booking dates") repeats once per pet.
// A no-op if nothing on the form is actually repeatable this way.
function wrapFieldsForPets(fields: FormField[], petNames: string[]): FormField[] {
  const keep: FormField[] = [];
  const repeat: FormField[] = [];
  for (const field of fields) {
    if (field.type === 'group' || field.mapping) {
      keep.push(field);
    } else {
      repeat.push(field);
    }
  }
  if (repeat.length === 0) {
    return fields;
  }
  const perPetGroup: FormField = {
    id: 'per-pet',
    type: 'group',
    label: 'Pet',
    required: false,
    repeatable: true,
    minRepeats: petNames.length,
    maxRepeats: petNames.length,
    createsAnimal: false,
    repetitionLabels: petNames,
    fields: repeat,
  };
  return [...keep, perPetGroup];
}

@Injectable()
export class FormSubmissionsService {
  constructor(
    @InjectModel(FormSubmission.name)
    private readonly formSubmissionModel: Model<FormSubmission>,
    private readonly formsService: FormsService,
    private readonly customersService: CustomersService,
    private readonly animalsService: AnimalsService,
    private readonly auditLogService: AuditLogService,
    private readonly settingsService: SettingsService,
  ) {}

  async create(dto: CreateFormSubmissionDto): Promise<FormSubmission> {
    const form = await this.formsService.findOne(dto.form);
    const animals = dto.animals ?? [];
    let formFieldsSnapshot = form.fields as unknown as FormField[];
    if (animals.length > 1) {
      // Resolved in the given order (not re-sorted) so repetitionLabels
      // lines up with whatever order the customer's own pets were selected
      // in -- purely cosmetic, but keeps the generated link matching what
      // staff actually picked.
      const pets = await Promise.all(animals.map((id) => this.animalsService.findOne(id)));
      formFieldsSnapshot = wrapFieldsForPets(formFieldsSnapshot, pets.map((p) => p.name));
    }
    return new this.formSubmissionModel({
      form: form._id,
      formName: form.name,
      formDescription: form.description,
      formFieldsSnapshot,
      status: FormSubmissionStatus.PENDING,
      customer: dto.customer,
      animal: animals.length === 1 ? animals[0] : undefined,
      animals: animals.length > 1 ? animals : undefined,
      recipientEmail: dto.recipientEmail,
      recipientName: dto.recipientName,
    }).save();
  }

  // Staff fixing a typo'd recipient, or correcting who a record shows as sent
  // to after the fact -- allowed regardless of status, since this only ever
  // touches the recipient name/email on file, never the submitted answers or
  // whatever Customer/Animal a completed submission already created.
  async update(
    id: string,
    dto: UpdateFormSubmissionDto,
  ): Promise<FormSubmission> {
    const submission = await this.findOne(id);
    if (dto.recipientName !== undefined)
      submission.recipientName = dto.recipientName;
    if (dto.recipientEmail !== undefined)
      submission.recipientEmail = dto.recipientEmail;
    return submission.save();
  }

  // Emails a PDF the caller already built client-side (buildFormSubmissionPdf,
  // admin/src/pdf/formSubmissionPdf.ts) of this submission to its recipient --
  // same "generate PDF client-side, POST the base64 data: URI, backend just
  // attaches and sends" shape as CustomersService.sendRegistrationCopy /
  // PaymentsService.sendReceipt. Used after staff complete a check-in/
  // check-out on a customer's behalf, so the customer gets a copy by email.
  async sendCopy(id: string, dto: SendFormSubmissionCopyDto): Promise<void> {
    const submission = await this.findOne(id);
    if (!submission.recipientEmail) {
      throw new BadRequestException('This submission has no recipient email on file.');
    }
    await this.settingsService.sendTemplatedEmail(
      EmailTrigger.FORM_COPY,
      submission.recipientEmail,
      { name: submission.recipientName || submission.recipientEmail, form_name: submission.formName },
      {},
      '',
      { data: dto.attachmentData, name: dto.attachmentName },
    );
    if (submission.customer) {
      await this.auditLogService.record(
        submission.customer,
        AuditEventType.REGISTRATION_EMAIL_SENT,
        'Form copy emailed',
        `${submission.formName} emailed to ${submission.recipientEmail}`,
        undefined,
        'Staff',
      );
    }
  }

  // Removes the link/record only -- never touches whatever Customer/Animal a
  // completed submission already created (same "delete the record, not its
  // downstream effects" shape as, e.g., AuditLogEntry never being touched by
  // deleting the thing it logged).
  async remove(id: string): Promise<void> {
    const result = await this.formSubmissionModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Form submission ${id} not found`);
    }
  }

  findAll(customerId?: string): Promise<FormSubmission[]> {
    const filter = customerId ? { customer: customerId } : {};
    return this.formSubmissionModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('customer', 'name email')
      .populate('animal', 'name')
      .populate('animals', 'name')
      .exec();
  }

  async findOne(id: string): Promise<FormSubmission> {
    const submission = await this.formSubmissionModel.findById(id).exec();
    if (!submission) {
      throw new NotFoundException(`Form submission ${id} not found`);
    }
    return submission;
  }

  async findOnePublic(id: string) {
    const submission = await this.findOne(id);

    // Both stay empty for a submission not yet tied to a real customer (a
    // brand-new lead sent by typed name/email only) -- see
    // resolveFieldsForRecipient's comment for what that means downstream.
    let placeholders: Record<string, string> = {};
    let petNames: string[] = [];
    if (submission.customer) {
      const customerId = submission.customer.toString();
      const [customer, animals] = await Promise.all([
        this.customersService.findOne(customerId).catch(() => null),
        this.animalsService.findAll(customerId),
      ]);
      petNames = animals.map((a) => a.name);
      // The one specific pet this submission was generated for (staff
      // multi-selecting pets in SendFormModal creates one submission per
      // pet) -- falls back to '' (not the full petNames list) when unset, so
      // {{petName}} only ever resolves to a single, unambiguous pet.
      const specificPet = submission.animal
        ? animals.find((a) => a._id.toString() === submission.animal!.toString())
        : undefined;
      if (customer) {
        placeholders = buildCustomerPlaceholders(customer, petNames, specificPet?.name);
      }
    }

    return {
      _id: submission._id.toString(),
      formName: submission.formName,
      formDescription: submission.formDescription,
      fields: resolveFieldsForRecipient(
        submission.formFieldsSnapshot as unknown as FormField[],
        placeholders,
        petNames,
      ),
      status: submission.status,
      recipientName: submission.recipientName,
      // Only meaningful once completed -- lets a resent link show what was
      // already submitted instead of just an "already submitted" dead end.
      answers: submission.answers ?? {},
    };
  }

  async submit(
    id: string,
    answers: Record<string, unknown>,
    req: Request,
  ): Promise<FormSubmission> {
    const submission = await this.findOne(id);
    if (submission.status === FormSubmissionStatus.COMPLETED) {
      throw new BadRequestException('This form has already been submitted.');
    }
    const actor = actorFromRequest(req);
    const fields = submission.formFieldsSnapshot as unknown as FormField[];
    const topLevelFields = fields.filter((f) => f.type !== 'group');
    const groupFields = fields.filter((f) => f.type === 'group');

    const customerPatchRaw = buildCustomerPatch(topLevelFields, answers);
    const isNewCustomer = !submission.customer;

    // Only a brand-new Customer needs the stub -- CustomersService.create()
    // unconditionally dereferences emergencyContact/emergencyVet (a TypeError
    // risk if either is entirely absent), while update() already guards both
    // with `if (dto.xxx)`, so a partial patch is safe there without a stub.
    const customerPayload = isNewCustomer
      ? { emergencyContact: {}, emergencyVet: {}, ...customerPatchRaw }
      : customerPatchRaw;
    const customerDtoClass = isNewCustomer
      ? CreateCustomerDto
      : UpdateCustomerDto;
    const customerInstance = plainToInstance(customerDtoClass, customerPayload);
    const customerErrors = await validate(customerInstance as object, {
      whitelist: true,
    });
    if (customerErrors.length) {
      throw new BadRequestException(flattenValidationErrors(customerErrors));
    }

    // Validate every pet-group repetition up front too, before writing
    // anything -- see form-submission-mapping.util.ts and the plan's
    // "Validation approach" note for why this can't just rely on Mongoose.
    const animalInstances: ValidateAnimalDto[] = [];
    for (const group of groupFields) {
      if (group.type !== 'group') continue;
      // A group not explicitly flagged to create a pet just captures its
      // repetitions as raw answer data (still saved onto the submission
      // below) -- it's never validated against CreateAnimalDto or written to
      // AnimalsService, since it was never meant to represent a full pet.
      if (group.createsAnimal === false) continue;
      const repetitions =
        (answers[group.id] as Record<string, unknown>[] | undefined) ?? [];
      for (const repetitionAnswers of repetitions) {
        const raw = buildAnimalPatch(group.fields, repetitionAnswers);
        const businessRuleError = validateAnimalBusinessRules(raw);
        if (businessRuleError) {
          throw new BadRequestException(businessRuleError);
        }
        const payload = {
          allergies: { status: 'no' },
          medication: { onMedication: false, medications: [] },
          ...raw,
        };
        const instance = plainToInstance(ValidateAnimalDto, payload);
        const errors = await validate(instance as object, { whitelist: true });
        if (errors.length) {
          throw new BadRequestException(flattenValidationErrors(errors));
        }
        animalInstances.push(instance);
      }
    }

    // Everything validated -- now write. Customer id is persisted onto the
    // submission immediately after its own write succeeds (before any pet
    // writes), so a retried submit (e.g. after a late failure creating a
    // pet) detects it's already resolved and switches to update() rather
    // than re-create()ing against the now-taken email. No DB transactions
    // exist anywhere in this codebase (confirmed) and none are introduced
    // here -- validating up front closes off nearly all of the failure
    // window; a failure between two pet writes is the one residual risk,
    // same class of risk this codebase already accepts elsewhere (e.g.
    // CreditNotesService.create()'s save + external side effects).
    let customerId: string;
    if (isNewCustomer) {
      const created = await this.customersService.create(
        customerInstance as CreateCustomerDto,
        actor,
      );
      customerId = created._id.toString();
      submission.customer = created._id;
      await submission.save();
    } else {
      customerId = submission.customer!.toString();
      await this.customersService.update(customerId, customerInstance, actor);
    }

    for (const animalInstance of animalInstances) {
      await this.animalsService.create(
        { ...animalInstance, customer: customerId },
        actor,
      );
    }

    submission.answers = answers;
    submission.status = FormSubmissionStatus.COMPLETED;
    submission.submittedAt = new Date();
    await submission.save();

    await this.auditLogService.record(
      customerId,
      AuditEventType.FORM_SUBMITTED,
      'Form submitted',
      `"${submission.formName}" submitted`,
      undefined,
      actor,
    );

    return submission;
  }
}
