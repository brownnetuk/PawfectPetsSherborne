import { Types } from 'mongoose';
import { FormSubmissionsService } from './form-submissions.service';
import { FormSubmissionStatus } from './schemas/form-submission.schema';

// Only its name is used (for @InjectModel) -- loading the real schema under
// ts-jest trips over statusOverride's union type, which has no emitted metadata.
jest.mock('../boarding-bookings/schemas/boarding-booking.schema', () => ({
  BoardingBooking: { name: 'BoardingBooking' },
}));
// Passed in as plain stubs below; the real modules drag in the whole
// Customers -> Bookings -> BoardingBookings import chain.
jest.mock('../customers/customers.service', () => ({
  CustomersService: class {},
}));
jest.mock('../animals/animals.service', () => ({ AnimalsService: class {} }));
jest.mock('../settings/settings.service', () => ({
  SettingsService: class {},
}));
jest.mock('../notifications/notification.service', () => ({
  NotificationService: class {},
}));
jest.mock('../forms/forms.service', () => ({ FormsService: class {} }));

// Plain mocks rather than an in-memory MongoDB -- covers starting a booking's
// check-in/check-out more than once, and grouping it under that booking.
describe('FormSubmissionsService booking check-in/check-out drafts', () => {
  const formId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const bookingId = new Types.ObjectId();
  const chain = <T>(value: T) => {
    const q = {
      sort: jest.fn(),
      exec: jest.fn().mockResolvedValue(value),
      populate: jest.fn(),
      select: jest.fn(),
      lean: jest.fn(),
    };
    q.sort.mockReturnValue(q);
    q.populate.mockReturnValue(q);
    q.select.mockReturnValue(q);
    q.lean.mockReturnValue(q);
    return q;
  };

  let saved: Record<string, unknown>[];
  let submissionModel: jest.Mock & Record<string, jest.Mock>;
  let bookingModel: { find: jest.Mock };
  let auditLogService: { hasFormEmailSentBetween: jest.Mock };
  let settingsService: { getBoardingWorkflowSettings: jest.Mock };
  let service: FormSubmissionsService;

  beforeEach(() => {
    saved = [];
    submissionModel = Object.assign(
      jest.fn((doc: Record<string, unknown>) => ({
        save: jest.fn(() => {
          const withId = { _id: new Types.ObjectId(), ...doc };
          saved.push(withId);
          return Promise.resolve(withId);
        }),
      })),
      {
        findOne: jest.fn(() => chain(null)),
        find: jest.fn(),
        deleteMany: jest.fn(() => ({
          exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
        })),
      },
    ) as unknown as jest.Mock & Record<string, jest.Mock>;
    bookingModel = { find: jest.fn() };
    auditLogService = {
      hasFormEmailSentBetween: jest.fn().mockResolvedValue(false),
    };
    settingsService = {
      getBoardingWorkflowSettings: jest.fn().mockResolvedValue({
        checkInFormBoarding: formId.toString(),
        checkInFormDayCare: null,
        checkOutFormBoarding: null,
        checkOutFormDayCare: null,
      }),
    };
    const formsService = {
      findOne: jest.fn().mockResolvedValue({
        _id: formId,
        name: 'Arrival Check-In',
        description: '',
        fields: [],
      }),
    };
    service = new FormSubmissionsService(
      submissionModel as never,
      formsService as never,
      {} as never,
      {} as never,
      auditLogService as never,
      settingsService as never,
      {} as never,
      bookingModel as never,
    );
  });

  const checkIn = {
    form: formId.toString(),
    customer: customerId.toString(),
    recipientEmail: 'sarah@example.com',
    forBooking: bookingId.toString(),
    bookingStage: 'checkIn' as const,
  };

  it('creates a pending check-in tagged with its booking the first time', async () => {
    await service.create(checkIn);
    expect(submissionModel.findOne).toHaveBeenCalledWith({
      forBooking: checkIn.forBooking,
      bookingStage: 'checkIn',
      form: formId,
      status: FormSubmissionStatus.PENDING,
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      forBooking: checkIn.forBooking,
      bookingStage: 'checkIn',
    });
  });

  it("reuses the booking's still-pending check-in instead of creating another", async () => {
    const existing = {
      _id: new Types.ObjectId(),
      status: FormSubmissionStatus.PENDING,
    };
    submissionModel.findOne.mockReturnValue(chain(existing));
    expect(await service.create(checkIn)).toBe(existing);
    expect(saved).toHaveLength(0);
  });

  it('leaves an ordinary send untouched', async () => {
    await service.create({
      form: formId.toString(),
      customer: customerId.toString(),
      recipientEmail: 'a@b.com',
    });
    expect(submissionModel.findOne).not.toHaveBeenCalled();
    expect(saved[0]).toMatchObject({
      forBooking: undefined,
      bookingStage: undefined,
    });
  });

  it("groups an unrecorded check-in under its booking on the customer's list", async () => {
    const draftId = new Types.ObjectId();
    const otherId = new Types.ObjectId();
    const doc = (fields: Record<string, unknown>) => ({
      ...fields,
      toObject: () => fields,
    });
    submissionModel.find.mockReturnValue(
      chain([
        doc({ _id: draftId, forBooking: bookingId }),
        doc({ _id: otherId }),
      ]),
    );
    bookingModel.find.mockReturnValue(
      chain([{ _id: bookingId, reference: 'BK00001', incidentReports: [] }]),
    );
    const rows = (await service.findAll(customerId.toString())) as Record<
      string,
      unknown
    >[];
    expect(rows[0].booking).toEqual({
      _id: bookingId.toString(),
      reference: 'BK00001',
    });
    expect(rows[1].booking).toBeUndefined();
  });

  describe('removing unsubmitted check-in/check-out forms left from before', () => {
    const createdAt = new Date('2026-10-17T09:00:00Z');
    const linkedId = new Types.ObjectId();
    const orphanId = new Types.ObjectId();
    const emailedId = new Types.ObjectId();

    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      submissionModel.find.mockReturnValue(
        chain([
          {
            _id: linkedId,
            customer: customerId,
            formName: 'Arrival Check-In',
            createdAt,
          },
          {
            _id: orphanId,
            customer: customerId,
            formName: 'Arrival Check-In',
            createdAt,
          },
          {
            _id: emailedId,
            customer: customerId,
            formName: 'Arrival Check-In',
            createdAt,
          },
        ]),
      );
      bookingModel.find.mockReturnValue(
        chain([
          { _id: bookingId, checkInSubmission: linkedId, incidentReports: [] },
        ]),
      );
      auditLogService.hasFormEmailSentBetween.mockImplementation(() =>
        Promise.resolve(
          auditLogService.hasFormEmailSentBetween.mock.calls.length === 2,
        ),
      );
    });

    it('only looks at pending, unlinked submissions of the configured check-in/check-out forms', async () => {
      await service.removeAbandonedCheckForms();
      expect(submissionModel.find).toHaveBeenCalledWith({
        form: { $in: [formId.toString()] },
        status: FormSubmissionStatus.PENDING,
        forBooking: { $exists: false },
        customerRiskAssessment: { $ne: true },
      });
    });

    it('deletes the orphans, keeping one a booking links to and one that was emailed', async () => {
      await service.removeAbandonedCheckForms();
      expect(auditLogService.hasFormEmailSentBetween).toHaveBeenCalledWith(
        customerId.toString(),
        'Arrival Check-In',
        createdAt,
        new Date(createdAt.getTime() + 10 * 60 * 1000),
      );
      expect(submissionModel.deleteMany).toHaveBeenCalledWith({
        _id: { $in: [orphanId.toString()] },
      });
    });

    it('does nothing when no check-in/check-out form is configured', async () => {
      settingsService.getBoardingWorkflowSettings.mockResolvedValue({});
      await service.removeAbandonedCheckForms();
      expect(submissionModel.find).not.toHaveBeenCalled();
      expect(submissionModel.deleteMany).not.toHaveBeenCalled();
    });
  });
});
