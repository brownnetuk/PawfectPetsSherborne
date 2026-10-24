import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import { FormSubmission, FormSubmissionStatus } from '../form-submissions/schemas/form-submission.schema';
import { FormsService } from '../forms/forms.service';
import { SettingsService } from '../settings/settings.service';
import { BoardingBooking } from './schemas/boarding-booking.schema';

// Incident Reports on a Boarding & Day Care booking's detail page -- each one
// is an ordinary FormSubmission of the form chosen in Settings > Boarding
// ("Incident report form", the seeded "Incident Report" by default), filled
// in by staff through the same FormFillModal as check-in/check-out and
// listed on BoardingBooking.incidentReports. Reusing FormSubmission (rather
// than a collection of its own, like BookingObservation) means each report
// also shows in the customer's own Forms history, renders through the same
// branded formSubmissionPdf.ts export, and survives the booking being
// deleted. Unlike check-in/check-out, reports stay editable once the
// booking is complete -- an incident can come to light (or need the licence
// holder's review sign-off) after the dog has gone home.
// The booking a report belongs to, as each list row shows it -- so the
// all-bookings list (Boarding & Day Care > Incident Reports) can say which
// booking/customer each report is for, and the fill form's booking picker
// can start on the right one.
export interface IncidentReportBooking {
  _id: string;
  reference: string;
  customerName?: string;
  petNames: string[];
}

type PopulatedBooking = BoardingBooking & {
  customer?: { _id?: Types.ObjectId; name?: string; email?: string } | null;
  animals: ({ name?: string } | Types.ObjectId)[];
};

function bookingSummary(booking: PopulatedBooking): IncidentReportBooking {
  return {
    _id: String(booking._id),
    reference: booking.reference,
    customerName: booking.customer?.name,
    petNames: booking.animals
      .map((a) => (a && 'name' in a ? a.name : undefined))
      .filter((n): n is string => !!n),
  };
}

@Injectable()
export class BookingIncidentReportsService {
  constructor(
    @InjectModel(BoardingBooking.name)
    private readonly boardingBookingModel: Model<BoardingBooking>,
    @InjectModel(FormSubmission.name)
    private readonly formSubmissionModel: Model<FormSubmission>,
    private readonly formsService: FormsService,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async findBooking(bookingId: string): Promise<BoardingBooking> {
    const booking = await this.boardingBookingModel.findById(bookingId).exec();
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
    return booking;
  }

  private isLinked(booking: BoardingBooking, submissionId: string): boolean {
    return (booking.incidentReports ?? []).some((id) => id.toString() === submissionId);
  }

  // Completed reports only, newest first, each with its booking attached --
  // a pending one is a form staff opened and haven't submitted (or
  // abandoned), nothing to show yet.
  private async reportsFor(bookings: PopulatedBooking[]) {
    const bookingByReport = new Map<string, IncidentReportBooking>();
    for (const booking of bookings) {
      const summary = bookingSummary(booking);
      for (const id of booking.incidentReports ?? []) bookingByReport.set(id.toString(), summary);
    }
    const reports = await this.formSubmissionModel
      .find({ _id: { $in: [...bookingByReport.keys()] }, status: FormSubmissionStatus.COMPLETED })
      .sort({ submittedAt: -1 })
      .exec();
    return reports.map((r) => ({ ...r.toObject(), booking: bookingByReport.get(String(r._id)) }));
  }

  private populated(filter: Record<string, unknown>) {
    return this.boardingBookingModel
      .find(filter)
      .populate('customer', 'name email')
      .populate('animals', 'name')
      .exec() as unknown as Promise<PopulatedBooking[]>;
  }

  async findForBooking(bookingId: string) {
    const bookings = await this.populated({ _id: bookingId });
    if (bookings.length === 0) throw new NotFoundException(`Booking ${bookingId} not found`);
    return this.reportsFor(bookings);
  }

  // Every booking's reports, for Boarding & Day Care > Incident Reports.
  async findAll() {
    return this.reportsFor(await this.populated({ 'incidentReports.0': { $exists: true } }));
  }

  // Starts a new (pending) report for staff to fill in, already linked to
  // the booking -- a minimal direct port of FormSubmissionsService.create(),
  // kept local for the same circular-module reason as
  // BoardingBookingsService.sendPreCheckIn(). Deliberately not tied to the
  // booking's animals: that would wrap every field into a per-pet section
  // (wrapFieldsForPets) on a multi-dog booking, while an incident is one
  // event -- the form's own "Dog(s) involved" field says which dogs.
  async create(bookingId: string): Promise<FormSubmission> {
    const booking = await this.boardingBookingModel.findById(bookingId).populate('customer', 'name email').exec();
    if (!booking) throw new NotFoundException(`Booking ${bookingId} not found`);
    const customer = booking.customer as unknown as { _id?: Types.ObjectId; name?: string; email?: string };
    if (!customer?.email) {
      throw new BadRequestException('This customer has no email address on file.');
    }
    const workflow = await this.settingsService.getBoardingWorkflowSettings();
    if (!workflow.incidentReportForm) {
      throw new BadRequestException('No incident report form is configured yet -- set one in Settings > Boarding first.');
    }
    const form = await this.formsService.findOne(workflow.incidentReportForm);
    const submission = await new this.formSubmissionModel({
      form: form._id,
      formName: form.name,
      formDescription: form.description,
      formFieldsSnapshot: form.fields,
      status: FormSubmissionStatus.PENDING,
      customer: customer._id,
      recipientEmail: customer.email,
      recipientName: customer.name,
    }).save();
    await this.boardingBookingModel
      .updateOne({ _id: booking._id }, { $addToSet: { incidentReports: submission._id } })
      .exec();
    return submission;
  }

  // Staff correcting or completing a submitted report (e.g. the licence
  // holder adding their review) -- replaces the answers wholesale, the same
  // way the fill form sends them. Never re-runs submit()'s Customer/Animal
  // mapping: an incident report has nothing mapped.
  async updateAnswers(
    bookingId: string,
    submissionId: string,
    answers: Record<string, unknown>,
    staffName: string,
  ): Promise<FormSubmission> {
    const booking = await this.findBooking(bookingId);
    if (!this.isLinked(booking, submissionId)) {
      throw new NotFoundException(`Incident report ${submissionId} not found on this booking`);
    }
    const submission = await this.formSubmissionModel.findById(submissionId).exec();
    if (!submission) throw new NotFoundException(`Incident report ${submissionId} not found`);
    if (submission.status !== FormSubmissionStatus.COMPLETED) {
      throw new BadRequestException('This incident report has not been submitted yet.');
    }
    submission.answers = answers;
    submission.markModified('answers');
    await submission.save();
    if (submission.customer) {
      await this.auditLogService.record(
        submission.customer,
        AuditEventType.BOOKING_UPDATED,
        'Incident report updated',
        `${submission.formName} on ${booking.reference} updated`,
        undefined,
        staffName,
      );
    }
    return submission;
  }

  // Staff picking a different booking reference on the report -- relinks
  // it to that booking and re-points it at that booking's customer (who the
  // emailed copy goes to, and whose forms it shows under).
  async move(
    bookingId: string,
    submissionId: string,
    targetBookingId: string,
    staffName: string,
  ): Promise<FormSubmission> {
    const booking = await this.findBooking(bookingId);
    if (!this.isLinked(booking, submissionId)) {
      throw new NotFoundException(`Incident report ${submissionId} not found on this booking`);
    }
    const submission = await this.formSubmissionModel.findById(submissionId).exec();
    if (!submission) throw new NotFoundException(`Incident report ${submissionId} not found`);
    if (targetBookingId === bookingId) return submission;
    const target = await this.boardingBookingModel.findById(targetBookingId).populate('customer', 'name email').exec();
    if (!target) throw new NotFoundException(`Booking ${targetBookingId} not found`);
    const customer = target.customer as unknown as { _id?: Types.ObjectId; name?: string; email?: string };
    if (!customer?.email) {
      throw new BadRequestException('That booking\'s customer has no email address on file.');
    }
    submission.customer = customer._id;
    submission.recipientEmail = customer.email;
    submission.recipientName = customer.name;
    await submission.save();
    const id = new Types.ObjectId(submissionId);
    await this.boardingBookingModel.updateOne({ _id: booking._id }, { $pull: { incidentReports: id } }).exec();
    await this.boardingBookingModel.updateOne({ _id: target._id }, { $addToSet: { incidentReports: id } }).exec();
    if (customer._id && submission.status === FormSubmissionStatus.COMPLETED) {
      await this.auditLogService.record(
        customer._id,
        AuditEventType.BOOKING_UPDATED,
        'Incident report linked',
        `${submission.formName} moved from ${booking.reference} to ${target.reference}`,
        undefined,
        staffName,
      );
    }
    return submission;
  }

  // Unlinks and deletes the report -- also how the booking page discards a
  // pending one staff cancelled without submitting.
  async remove(bookingId: string, submissionId: string): Promise<void> {
    const booking = await this.findBooking(bookingId);
    if (!this.isLinked(booking, submissionId)) {
      throw new NotFoundException(`Incident report ${submissionId} not found on this booking`);
    }
    await this.boardingBookingModel
      .updateOne({ _id: booking._id }, { $pull: { incidentReports: new Types.ObjectId(submissionId) } })
      .exec();
    await this.formSubmissionModel.findByIdAndDelete(submissionId).exec();
  }
}
