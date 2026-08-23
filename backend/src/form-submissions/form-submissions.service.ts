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
import { FormsService } from '../forms/forms.service';
import { CreateFormSubmissionDto } from './dto/create-form-submission.dto';
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

// Strips internal field-mapping details before returning a form's shape to an
// unauthenticated caller -- not a hard security boundary (submit() re-validates
// everything server-side regardless), just no reason to leak Customer/Animal
// DB path names to the public.
function stripMappings(fields: FormField[]): Omit<FormField, 'mapping'>[] {
  return fields.map((field) => {
    const copy = { ...field } as Record<string, unknown>;
    delete copy.mapping;
    if (field.type === 'group') {
      copy.fields = stripMappings(field.fields);
      return copy as unknown as Omit<FormField, 'mapping'>;
    }
    return copy as unknown as Omit<FormField, 'mapping'>;
  });
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
  ) {}

  async create(dto: CreateFormSubmissionDto): Promise<FormSubmission> {
    const form = await this.formsService.findOne(dto.form);
    return new this.formSubmissionModel({
      form: form._id,
      formName: form.name,
      formFieldsSnapshot: form.fields,
      status: FormSubmissionStatus.PENDING,
      customer: dto.customer,
      recipientEmail: dto.recipientEmail,
      recipientName: dto.recipientName,
    }).save();
  }

  findAll(customerId?: string): Promise<FormSubmission[]> {
    const filter = customerId ? { customer: customerId } : {};
    return this.formSubmissionModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('customer', 'name email')
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
    return {
      _id: submission._id.toString(),
      formName: submission.formName,
      fields: stripMappings(
        submission.formFieldsSnapshot as unknown as FormField[],
      ),
      status: submission.status,
      recipientName: submission.recipientName,
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
