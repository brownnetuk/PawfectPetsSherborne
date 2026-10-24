import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FormSubmissionStatus } from '../form-submissions/schemas/form-submission.schema';
import { BookingIncidentReportsService } from './booking-incident-reports.service';

// Only its name is used (for @InjectModel) -- loading the real schema under
// ts-jest trips over statusOverride's union type, which has no emitted metadata.
jest.mock('./schemas/boarding-booking.schema', () => ({ BoardingBooking: { name: 'BoardingBooking' } }));

// Plain mocks rather than an in-memory MongoDB -- this service only glues a
// booking's incidentReports list to ordinary FormSubmissions.
describe('BookingIncidentReportsService', () => {
  const bookingId = new Types.ObjectId().toString();
  const formId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const linkedId = new Types.ObjectId();
  const exec = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

  let booking: { _id: string; reference: string; incidentReports: Types.ObjectId[]; customer: unknown };
  let saved: Record<string, unknown>[];
  let bookingModel: Record<string, jest.Mock>;
  let submissionModel: jest.Mock & Record<string, jest.Mock>;
  let settingsService: { getBoardingWorkflowSettings: jest.Mock };
  let auditLogService: { record: jest.Mock };
  let service: BookingIncidentReportsService;

  beforeEach(() => {
    booking = {
      _id: bookingId,
      reference: 'BK00010',
      incidentReports: [linkedId],
      customer: { _id: customerId, name: 'Sarah Jones', email: 'sarah@example.com' },
    };
    saved = [];
    bookingModel = {
      findById: jest.fn(() => ({ ...exec(booking), populate: jest.fn(() => exec(booking)) })),
      updateOne: jest.fn(() => exec({})),
    };
    submissionModel = Object.assign(
      jest.fn((doc: Record<string, unknown>) => ({
        save: jest.fn(() => {
          const withId = { _id: new Types.ObjectId(), ...doc };
          saved.push(withId);
          return Promise.resolve(withId);
        }),
      })),
      { findById: jest.fn(), find: jest.fn(), findByIdAndDelete: jest.fn(() => exec({})) },
    );
    settingsService = { getBoardingWorkflowSettings: jest.fn().mockResolvedValue({ incidentReportForm: formId.toString() }) };
    auditLogService = { record: jest.fn() };
    const formsService = {
      findOne: jest.fn().mockResolvedValue({ _id: formId, name: 'Incident Report', description: 'd', fields: [{ id: 'x' }] }),
    };
    service = new BookingIncidentReportsService(
      bookingModel as never,
      submissionModel as never,
      formsService as never,
      settingsService as never,
      auditLogService as never,
    );
  });

  it('starts a pending report from the configured form and links it to the booking', async () => {
    await service.create(bookingId);
    expect(saved[0]).toMatchObject({
      form: formId,
      formName: 'Incident Report',
      status: FormSubmissionStatus.PENDING,
      customer: customerId,
      recipientEmail: 'sarah@example.com',
    });
    expect(saved[0].animals).toBeUndefined();
    expect(bookingModel.updateOne).toHaveBeenCalledWith(
      { _id: bookingId },
      { $addToSet: { incidentReports: saved[0]._id } },
    );
  });

  it('refuses to start a report when no form is configured', async () => {
    settingsService.getBoardingWorkflowSettings.mockResolvedValue({ incidentReportForm: null });
    await expect(service.create(bookingId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replaces the answers on a linked, submitted report and logs it', async () => {
    const submission = {
      _id: linkedId,
      customer: customerId,
      formName: 'Incident Report',
      status: FormSubmissionStatus.COMPLETED,
      answers: { a: 1 },
      markModified: jest.fn(),
      save: jest.fn(),
    };
    submissionModel.findById.mockReturnValue(exec(submission));
    await service.updateAnswers(bookingId, linkedId.toString(), { a: 2 }, 'James');
    expect(submission.answers).toEqual({ a: 2 });
    expect(submission.save).toHaveBeenCalled();
    expect(auditLogService.record).toHaveBeenCalledWith(
      customerId,
      expect.anything(),
      'Incident report updated',
      'Incident Report on BK00010 updated',
      undefined,
      'James',
    );
  });

  it('will not edit or delete a submission that is not on this booking', async () => {
    const other = new Types.ObjectId().toString();
    await expect(service.updateAnswers(bookingId, other, {}, 'James')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(bookingId, other)).rejects.toBeInstanceOf(NotFoundException);
    expect(submissionModel.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('unlinks and deletes a report', async () => {
    await service.remove(bookingId, linkedId.toString());
    expect(bookingModel.updateOne).toHaveBeenCalledWith({ _id: bookingId }, { $pull: { incidentReports: linkedId } });
    expect(submissionModel.findByIdAndDelete).toHaveBeenCalledWith(linkedId.toString());
  });
});
