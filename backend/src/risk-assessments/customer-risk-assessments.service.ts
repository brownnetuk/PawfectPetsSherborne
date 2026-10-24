import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import { Customer } from '../customers/schemas/customer.schema';
import { FormSubmission, FormSubmissionStatus } from '../form-submissions/schemas/form-submission.schema';
import { CRA_DATE_FIELD } from '../forms/default-customer-risk-assessment-form';
import { FormsService } from '../forms/forms.service';
import { SettingsService } from '../settings/settings.service';

// Customer Risk Assessments (Risk Assessments > Customer Risk Assessments,
// and the customer's Forms tab) -- each one is an ordinary FormSubmission of
// the form chosen in Settings > Boarding ("Customer risk assessment form",
// the seeded "New Dog Intake Risk Assessment" by default), tied to the
// customer and flagged customerRiskAssessment. The same approach as a
// booking's incident reports (BookingIncidentReportsService): filled in by
// staff through FormFillModal, shown in the customer's Forms history,
// rendered through the branded formSubmissionPdf.ts export, and editable
// after it's submitted. Which of the customer's dogs it covers is the form's
// own customer's-dogs field.
@Injectable()
export class CustomerRiskAssessmentsService implements OnModuleInit {
  constructor(
    @InjectModel(FormSubmission.name)
    private readonly formSubmissionModel: Model<FormSubmission>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<Customer>,
    private readonly formsService: FormsService,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Assessments saved while the form's date was a non-editable 'today' field
  // get the editable date field in their snapshot too, so editing one lets
  // staff change its date (the saved answer is kept). A no-op once converted.
  async onModuleInit(): Promise<void> {
    await this.formSubmissionModel
      .updateMany(
        {
          customerRiskAssessment: true,
          formFieldsSnapshot: { $elemMatch: { id: CRA_DATE_FIELD.id, type: 'today' } },
        },
        { $set: { 'formFieldsSnapshot.$[f]': CRA_DATE_FIELD } },
        { arrayFilters: [{ 'f.id': CRA_DATE_FIELD.id, 'f.type': 'today' }] },
      )
      .exec();
  }

  private async findAssessment(id: string): Promise<FormSubmission> {
    const submission = await this.formSubmissionModel.findOne({ _id: id, customerRiskAssessment: true }).exec();
    if (!submission) throw new NotFoundException(`Customer risk assessment ${id} not found`);
    return submission;
  }

  private async findCustomer(id: string) {
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    if (!customer.email) throw new BadRequestException('This customer has no email address on file.');
    return customer;
  }

  // Completed assessments only, newest first, with the customer's name -- a
  // pending one is a form staff opened and haven't submitted (or abandoned).
  findAll(customerId?: string) {
    const filter: Record<string, unknown> = { customerRiskAssessment: true, status: FormSubmissionStatus.COMPLETED };
    if (customerId) filter.customer = customerId;
    return this.formSubmissionModel.find(filter).sort({ submittedAt: -1 }).populate('customer', 'name').exec();
  }

  // Starts a new (pending) assessment for staff to fill in -- a minimal port
  // of FormSubmissionsService.create(), as BookingIncidentReportsService.create()
  // does. Not tied to the customer's animals, which would wrap every field
  // into a per-pet section: the form's "Dog's name" field says which dogs.
  async create(customerId: string): Promise<FormSubmission> {
    const customer = await this.findCustomer(customerId);
    const workflow = await this.settingsService.getBoardingWorkflowSettings();
    if (!workflow.customerRiskAssessmentForm) {
      throw new BadRequestException(
        'No customer risk assessment form is configured yet -- set one in Settings > Boarding first.',
      );
    }
    const form = await this.formsService.findOne(workflow.customerRiskAssessmentForm);
    return new this.formSubmissionModel({
      form: form._id,
      formName: form.name,
      formDescription: form.description,
      formFieldsSnapshot: form.fields,
      status: FormSubmissionStatus.PENDING,
      customer: customer._id,
      recipientEmail: customer.email,
      recipientName: customer.name,
      customerRiskAssessment: true,
    }).save();
  }

  // Staff correcting a submitted assessment -- replaces the answers wholesale,
  // the same way the fill form sends them.
  async updateAnswers(id: string, answers: Record<string, unknown>, staffName: string): Promise<FormSubmission> {
    const submission = await this.findAssessment(id);
    if (submission.status !== FormSubmissionStatus.COMPLETED) {
      throw new BadRequestException('This risk assessment has not been submitted yet.');
    }
    submission.answers = answers;
    submission.markModified('answers');
    await submission.save();
    if (submission.customer) {
      await this.auditLogService.record(
        submission.customer,
        AuditEventType.FORM_SUBMITTED,
        'Risk assessment updated',
        `${submission.formName} updated`,
        undefined,
        staffName,
      );
    }
    return submission;
  }

  // Staff picking a different customer on the assessment -- re-points it
  // there (who the emailed copy goes to, and whose forms it shows under).
  async move(id: string, customerId: string, staffName: string): Promise<FormSubmission> {
    const submission = await this.findAssessment(id);
    if (submission.customer?.toString() === customerId) return submission;
    const customer = await this.findCustomer(customerId);
    submission.customer = customer._id as Types.ObjectId;
    submission.recipientEmail = customer.email;
    submission.recipientName = customer.name;
    await submission.save();
    if (submission.status === FormSubmissionStatus.COMPLETED) {
      await this.auditLogService.record(
        customer._id as Types.ObjectId,
        AuditEventType.FORM_SUBMITTED,
        'Risk assessment linked',
        `${submission.formName} moved to this customer`,
        undefined,
        staffName,
      );
    }
    return submission;
  }

  // Also how the fill form discards a pending one staff cancelled.
  async remove(id: string): Promise<void> {
    await this.findAssessment(id);
    await this.formSubmissionModel.findByIdAndDelete(id).exec();
  }
}
