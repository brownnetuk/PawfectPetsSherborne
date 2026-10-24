import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FormSubmissionStatus } from '../form-submissions/schemas/form-submission.schema';
import { CustomerRiskAssessmentsService } from './customer-risk-assessments.service';

// Plain mocks rather than an in-memory MongoDB -- this service only starts
// and manages flagged FormSubmissions for a customer.
describe('CustomerRiskAssessmentsService', () => {
  const formId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

  let customer: { _id: Types.ObjectId; name: string; email?: string } | null;
  let saved: Record<string, unknown>[];
  let submissionModel: jest.Mock & Record<string, jest.Mock>;
  let customerModel: { findById: jest.Mock };
  let settingsService: { getBoardingWorkflowSettings: jest.Mock };
  let auditLogService: { record: jest.Mock };
  let service: CustomerRiskAssessmentsService;

  beforeEach(() => {
    customer = { _id: customerId, name: 'Sarah Jones', email: 'sarah@example.com' };
    saved = [];
    submissionModel = Object.assign(
      jest.fn((doc: Record<string, unknown>) => ({
        save: jest.fn(() => {
          const withId = { _id: new Types.ObjectId(), ...doc };
          saved.push(withId);
          return Promise.resolve(withId);
        }),
      })),
      { findOne: jest.fn(), find: jest.fn(), findByIdAndDelete: jest.fn(() => exec({})) },
    ) as jest.Mock & Record<string, jest.Mock>;
    customerModel = { findById: jest.fn(() => exec(customer)) };
    settingsService = {
      getBoardingWorkflowSettings: jest.fn().mockResolvedValue({ customerRiskAssessmentForm: formId.toString() }),
    };
    auditLogService = { record: jest.fn() };
    const formsService = {
      findOne: jest
        .fn()
        .mockResolvedValue({ _id: formId, name: 'New Dog Intake Risk Assessment', description: 'd', fields: [{ id: 'x' }] }),
    };
    service = new CustomerRiskAssessmentsService(
      submissionModel as never,
      customerModel as never,
      formsService as never,
      settingsService as never,
      auditLogService as never,
    );
  });

  it('starts a flagged, pending assessment for the customer from the configured form', async () => {
    await service.create(customerId.toString());
    expect(saved[0]).toMatchObject({
      form: formId,
      formName: 'New Dog Intake Risk Assessment',
      status: FormSubmissionStatus.PENDING,
      customer: customerId,
      recipientEmail: 'sarah@example.com',
      customerRiskAssessment: true,
    });
    expect(saved[0].animals).toBeUndefined();
  });

  it('refuses to start one when no form is configured', async () => {
    settingsService.getBoardingWorkflowSettings.mockResolvedValue({ customerRiskAssessmentForm: null });
    await expect(service.create(customerId.toString())).rejects.toThrow(BadRequestException);
  });

  it('refuses an unknown customer, or one with no email', async () => {
    customer = null;
    await expect(service.create(customerId.toString())).rejects.toThrow(NotFoundException);
    customer = { _id: customerId, name: 'No Email' };
    await expect(service.create(customerId.toString())).rejects.toThrow(BadRequestException);
  });

  it('lists completed assessments only, optionally for one customer', async () => {
    const populate = jest.fn(() => exec([]));
    const sort = jest.fn(() => ({ populate }));
    submissionModel.find.mockReturnValue({ sort });
    await service.findAll(customerId.toString());
    expect(submissionModel.find).toHaveBeenCalledWith({
      customerRiskAssessment: true,
      status: FormSubmissionStatus.COMPLETED,
      customer: customerId.toString(),
    });
  });

  it('only edits a submitted assessment', async () => {
    const submission = {
      status: FormSubmissionStatus.PENDING,
      customer: customerId,
      formName: 'RA',
      save: jest.fn(),
      markModified: jest.fn(),
    };
    submissionModel.findOne.mockReturnValue(exec(submission));
    await expect(service.updateAnswers('id', { a: 1 }, 'Staff')).rejects.toThrow(BadRequestException);
    submission.status = FormSubmissionStatus.COMPLETED;
    await service.updateAnswers('id', { a: 1 }, 'Staff');
    expect(submission.save).toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalled();
  });

  it('re-points an assessment at another customer', async () => {
    const otherId = new Types.ObjectId();
    customer = { _id: otherId, name: 'Tom Smith', email: 'tom@example.com' };
    const submission: Record<string, unknown> = {
      status: FormSubmissionStatus.COMPLETED,
      customer: customerId,
      formName: 'RA',
      save: jest.fn(),
    };
    submissionModel.findOne.mockReturnValue(exec(submission));
    await service.move('id', otherId.toString(), 'Staff');
    expect(submission).toMatchObject({ customer: otherId, recipientEmail: 'tom@example.com', recipientName: 'Tom Smith' });
  });

  it('only deletes flagged assessments', async () => {
    submissionModel.findOne.mockReturnValue(exec(null));
    await expect(service.remove('id')).rejects.toThrow(NotFoundException);
    expect(submissionModel.findByIdAndDelete).not.toHaveBeenCalled();
  });
});
