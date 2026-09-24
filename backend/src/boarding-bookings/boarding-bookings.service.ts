import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Animal } from '../animals/schemas/animal.schema';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import { CreditNote } from '../credit-notes/schemas/credit-note.schema';
import { CreditNotesService } from '../credit-notes/credit-notes.service';
import { Customer } from '../customers/schemas/customer.schema';
import {
  BoardingStayPlan,
  DayBookingsService,
  DayCareStayPlan,
} from '../day-bookings/day-bookings.service';
import { DayBooking } from '../day-bookings/schemas/day-booking.schema';
import {
  formatDocumentNumber,
  nextSequenceNumber,
} from '../common/document-number.util';
import { publicFrontendUrl } from '../common/tracking-pixel.util';
import { FormField } from '../forms/form-field.types';
import { getPath } from '../form-submissions/form-submission-mapping.util';
import { FormSubmission, FormSubmissionStatus } from '../form-submissions/schemas/form-submission.schema';
import { FormsService } from '../forms/forms.service';
import { Invoice, InvoiceStatus } from '../invoices/schemas/invoice.schema';
import { InvoicesService } from '../invoices/invoices.service';
import { Payment } from '../payments/schemas/payment.schema';
import { PaymentsService } from '../payments/payments.service';
import { Quote } from '../quotes/schemas/quote.schema';
import { BusinessInfo } from '../settings/schemas/business-info.schema';
import { EmailTrigger } from '../settings/schemas/email-template.schema';
import { SettingsService } from '../settings/settings.service';
import { AmendBoardingBookingDatesDto } from './dto/amend-boarding-booking-dates.dto';
import { CreateBoardingBookingDto } from './dto/create-boarding-booking.dto';
import { BookingStatusLabel, BoardingBooking } from './schemas/boarding-booking.schema';

export interface BoardingBookingStage {
  key:
    | 'quote'
    | 'confirmed'
    | 'invoiceRaised'
    | 'paymentReceived'
    | 'preCheckIn'
    | 'checkedIn'
    | 'inProgress'
    | 'checkedOut'
    | 'invoicePaid';
  label: string;
  done: boolean;
  current: boolean;
  sub?: string;
}

// Substitutes {{bookingReference}} (not one of form-placeholders.util.ts's
// customer tokens -- a booking has no customer-record analog there) into
// every top-level field's label, and resizes every group field to exactly
// this booking's animals -- one fixed repetition per pet, in booking order,
// no add/remove (mirrors FormSubmissionsService's own wrapFieldsForPets()
// shape: minRepeats === maxRepeats === count, repetitionLabels === names).
// Only the pre-check-in form actually has a group needing this today (its
// "Pet" section), but applying it to every group is simplest and harmless
// if a form with more than one group is ever sent this way.
function shapeSnapshotForBooking(fields: FormField[], reference: string, petNames: string[]): FormField[] {
  return fields.map((field) => {
    const label = field.label.split('{{bookingReference}}').join(reference);
    if (field.type === 'group') {
      return { ...field, label, minRepeats: petNames.length, maxRepeats: petNames.length, repetitionLabels: petNames };
    }
    return { ...field, label };
  });
}

function toAnswerValue(fieldType: FormField['type'], raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  if (fieldType === 'date' && raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (fieldType === 'toggle') return !!raw;
  return raw;
}

// The read-direction mirror of form-submission-mapping.util.ts's
// buildCustomerPatch/buildAnimalPatch (which build a Customer/Animal PATCH
// from submitted answers) -- this builds the pre-check-in submission's
// initial answers FROM the customer's/each booking animal's current record,
// via the same field.mapping.path each field already carries, so "please
// review and correct" pre-population and "edits sync back to the record"
// (FormSubmissionsService.submit()) stay driven by one shared source of
// truth (this form's own field definitions) rather than two hand-maintained
// lists that could drift apart.
function buildPreCheckInAnswers(
  fields: FormField[],
  customer: Record<string, unknown>,
  animals: Record<string, unknown>[],
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === 'group') {
      answers[field.id] = animals.map((animal) => {
        const repetition: Record<string, unknown> = {};
        for (const child of field.fields) {
          if (child.type === 'group' || !child.mapping || child.mapping.target !== 'animal') continue;
          const value = toAnswerValue(child.type, getPath(animal, child.mapping.path));
          if (value !== undefined) repetition[child.id] = value;
        }
        return repetition;
      });
      continue;
    }
    if (!field.mapping || field.mapping.target !== 'customer') continue;
    const value = toAnswerValue(field.type, getPath(customer, field.mapping.path));
    if (value !== undefined) answers[field.id] = value;
  }
  return answers;
}

@Injectable()
export class BoardingBookingsService {
  constructor(
    @InjectModel(BoardingBooking.name)
    private readonly boardingBookingModel: Model<BoardingBooking>,
    @InjectModel(BusinessInfo.name)
    private readonly businessInfoModel: Model<BusinessInfo>,
    @InjectModel(FormSubmission.name)
    private readonly formSubmissionModel: Model<FormSubmission>,
    // Read-only here (pre-check-in pre-fill) -- see boarding-bookings.module.ts's
    // comment for why these are registered directly rather than importing
    // CustomersModule/AnimalsModule (would be circular).
    @InjectModel(Customer.name)
    private readonly customerModel: Model<Customer>,
    @InjectModel(Animal.name)
    private readonly animalModel: Model<Animal>,
    // Read-only here too -- see remove()'s deleteAll option, which only
    // needs to find which payments/credit notes exist against an invoice
    // before deleting each one via paymentsService/creditNotesService below.
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<Payment>,
    @InjectModel(CreditNote.name)
    private readonly creditNoteModel: Model<CreditNote>,
    private readonly dayBookingsService: DayBookingsService,
    private readonly invoicesService: InvoicesService,
    private readonly paymentsService: PaymentsService,
    private readonly creditNotesService: CreditNotesService,
    private readonly formsService: FormsService,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async nextReference(): Promise<string> {
    const seq = await nextSequenceNumber(this.businessInfoModel, 'bookingRefNextNumber');
    const info = await this.businessInfoModel.findOne().exec();
    const template = info?.bookingRefTemplate || 'BK-{year}-{seq}';
    return formatDocumentNumber(template, seq);
  }

  private idOf(v: unknown): string {
    return String((v as { _id?: unknown })?._id ?? v);
  }

  // Groups a stay's non-placeholder DayBooking rows by product into invoice
  // line items -- used only for a direct (no-quote) booking, where there's no
  // quote line-items to copy from the way QuotesService's acceptAndConvert()
  // has for a quote-originated one.
  private buildLineItems(bookings: DayBooking[]) {
    const groups = new Map<string, { description: string; unitPrice: number; quantity: number }>();
    for (const b of bookings) {
      if (b.placeholder) continue;
      const product = b.product as unknown as { _id?: unknown; name?: string; price?: number } | undefined;
      const id = String(product?._id ?? b.product ?? '');
      if (!id) continue;
      const existing = groups.get(id);
      if (existing) existing.quantity += b.quantity ?? 1;
      else groups.set(id, { description: product?.name ?? 'Booking', unitPrice: product?.price ?? 0, quantity: b.quantity ?? 1 });
    }
    return [...groups.values()];
  }

  findAll(): Promise<BoardingBooking[]> {
    return this.boardingBookingModel
      .find()
      .sort({ createdAt: -1 })
      .populate('customer', 'name email')
      .populate('animals', 'name species')
      .populate('quote', 'quoteNumber')
      .populate('invoice')
      .exec();
  }

  async findOne(id: string): Promise<BoardingBooking> {
    const booking = await this.boardingBookingModel
      .findById(id)
      .populate('customer', 'name email')
      .populate('animals', 'name species')
      .populate('quote', 'quoteNumber')
      .populate('invoice')
      .exec();
    if (!booking) {
      throw new NotFoundException(`Boarding booking ${id} not found`);
    }
    return booking;
  }

  // Used by the Dashboard tab's Arriving/Departing/Day Care Today lists (a
  // stayId is all a DayBooking row carries) to find which BoardingBooking,
  // if any, a click should jump to -- null (not a 404) when the stay
  // predates this feature or was created outside it, so callers can fall
  // back to the legacy edit-modal behaviour instead of erroring.
  findByStayId(stayId: string): Promise<BoardingBooking | null> {
    return this.boardingBookingModel
      .findOne({ stayId })
      .populate('customer', 'name email')
      .populate('animals', 'name species')
      .exec();
  }

  // Called from QuotesService.acceptAndConvert() once the quote's invoice has
  // already been created -- builds this stay's DayBooking rows via the
  // shared DayBookingsService methods and links everything under one new
  // reference number. A quote carries at most one of dayCarePlan/boardingPlan.
  async createFromQuote(quote: Quote, invoiceId: string): Promise<BoardingBooking | undefined> {
    if (quote.dayCarePlan) {
      const plan = quote.dayCarePlan;
      const animalIds = plan.animals.map((a) => this.idOf(a));
      const dayCarePlan: DayCareStayPlan = {
        animals: animalIds,
        date: plan.date,
        dropOffPeriod: plan.dropOffPeriod as 'AM' | 'PM',
        dropOffTime: plan.dropOffTime,
        collectionPeriod: plan.collectionPeriod as 'AM' | 'PM',
        collectionTime: plan.collectionTime,
      };
      const { stayId, bookings } = await this.dayBookingsService.createDayCareStay(dayCarePlan, invoiceId);
      if (bookings.length === 0) return undefined;
      const reference = await this.nextReference();
      const created = await new this.boardingBookingModel({
        reference,
        customer: bookings[0].customer,
        animals: animalIds,
        type: 'dayCare',
        startDate: plan.date,
        dropOffTime: plan.dropOffTime,
        endDate: plan.date,
        pickUpTime: plan.collectionTime,
        quote: quote._id,
        stayId,
        invoice: invoiceId,
      }).save();
      await this.auditLogService.record(
        String(bookings[0].customer),
        AuditEventType.BOOKING_CREATED,
        'Booking created',
        `${reference} (day care) created from accepted quote ${quote.quoteNumber}`,
        undefined,
        'Customer',
      );
      return created;
    }
    if (quote.boardingPlan) {
      const plan = quote.boardingPlan;
      const animalIds = plan.animals.map((a) => this.idOf(a));
      const boardingPlan: BoardingStayPlan = {
        animals: animalIds,
        startDate: plan.startDate,
        dropOffTime: plan.dropOffTime,
        endDate: plan.endDate,
        pickUpTime: plan.pickUpTime,
      };
      const { stayId, bookings } = await this.dayBookingsService.createBoardingStay(boardingPlan, invoiceId);
      if (bookings.length === 0) return undefined;
      const reference = await this.nextReference();
      const created = await new this.boardingBookingModel({
        reference,
        customer: bookings[0].customer,
        animals: animalIds,
        type: 'boarding',
        startDate: plan.startDate,
        dropOffTime: plan.dropOffTime,
        endDate: plan.endDate,
        pickUpTime: plan.pickUpTime,
        quote: quote._id,
        stayId,
        invoice: invoiceId,
      }).save();
      await this.auditLogService.record(
        String(bookings[0].customer),
        AuditEventType.BOOKING_CREATED,
        'Booking created',
        `${reference} (boarding) created from accepted quote ${quote.quoteNumber}`,
        undefined,
        'Customer',
      );
      return created;
    }
    return undefined;
  }

  // Staff's "+ New booking" on the Bookings tab -- no quote involved, so this
  // raises the invoice itself from the resulting DayBooking rows' products
  // (see buildLineItems() above) rather than copying a quote's line items.
  async createDirect(dto: CreateBoardingBookingDto, actor = 'Staff'): Promise<BoardingBooking> {
    const endDate = dto.type === 'dayCare' ? dto.startDate : dto.endDate ?? dto.startDate;
    let stayId: string;
    let bookings: DayBooking[];
    if (dto.type === 'dayCare') {
      if (!dto.dropOffPeriod || !dto.collectionPeriod) {
        throw new BadRequestException('Day care bookings need a drop-off and collection period (AM/PM).');
      }
      ({ stayId, bookings } = await this.dayBookingsService.createDayCareStay({
        animals: dto.animals,
        date: dto.startDate,
        dropOffPeriod: dto.dropOffPeriod,
        dropOffTime: dto.dropOffTime,
        collectionPeriod: dto.collectionPeriod,
        collectionTime: dto.pickUpTime,
      }));
    } else {
      ({ stayId, bookings } = await this.dayBookingsService.createBoardingStay({
        animals: dto.animals,
        startDate: dto.startDate,
        dropOffTime: dto.dropOffTime,
        endDate,
        pickUpTime: dto.pickUpTime,
      }));
    }
    if (bookings.length === 0) {
      throw new BadRequestException('Nothing could be booked for these dates.');
    }
    const customerId = String(bookings[0].customer);
    const lineItems = this.buildLineItems(bookings);
    if (lineItems.length === 0) {
      throw new BadRequestException('No priced products resolved for this booking -- check Settings > Bookings.');
    }
    const issueDate = new Date().toISOString().slice(0, 10);
    const invoice = await this.invoicesService.create(
      {
        customer: customerId,
        lineItems,
        issueDate,
        dueDate: endDate,
        dayCarePlan:
          dto.type === 'dayCare'
            ? {
                animals: dto.animals,
                date: dto.startDate,
                dropOffPeriod: dto.dropOffPeriod!,
                dropOffTime: dto.dropOffTime,
                collectionPeriod: dto.collectionPeriod!,
                collectionTime: dto.pickUpTime,
              }
            : undefined,
        boardingPlan:
          dto.type === 'boarding'
            ? {
                animals: dto.animals,
                startDate: dto.startDate,
                dropOffTime: dto.dropOffTime,
                endDate,
                pickUpTime: dto.pickUpTime,
              }
            : undefined,
      },
      actor,
    );
    const invoiceId = (invoice._id as { toString(): string }).toString();
    await this.dayBookingsService.attachInvoiceToStay(stayId, invoiceId);
    const reference = await this.nextReference();
    return new this.boardingBookingModel({
      reference,
      customer: customerId,
      animals: dto.animals,
      type: dto.type,
      startDate: dto.startDate,
      dropOffTime: dto.dropOffTime,
      endDate,
      pickUpTime: dto.pickUpTime,
      notes: dto.notes,
      stayId,
      invoice: invoiceId,
    }).save();
  }

  // Deletes the invoice first (reusing InvoicesService.remove()'s own
  // guard against payments/credit notes recorded against it -- if that
  // throws, the booking and its DayBooking rows are left untouched,
  // same "remove those first" behaviour as deleting an invoice anywhere
  // else in the app), then the stay's DayBooking rows, then the booking
  // itself. `deleteAll` (the Booking Detail page's "Delete all" follow-up,
  // offered once staff hit that exact block) removes every payment/credit
  // note against the invoice FIRST, each via its own service method (so the
  // invoice balance, bank account balance, and any linked charges expense
  // all get reversed correctly, and each removal is still audit-logged) --
  // once none are left, InvoicesService.remove() no longer has anything to
  // block on.
  async remove(id: string, actor = 'Staff', deleteAll = false): Promise<void> {
    const booking = await this.boardingBookingModel.findById(id).exec();
    if (!booking) throw new NotFoundException(`Boarding booking ${id} not found`);
    if (booking.invoice) {
      const invoiceId = booking.invoice.toString();
      if (deleteAll) {
        const [payments, creditNotes] = await Promise.all([
          this.paymentModel.find({ invoice: invoiceId }).exec(),
          this.creditNoteModel.find({ invoice: invoiceId }).exec(),
        ]);
        for (const payment of payments) {
          await this.paymentsService.remove(payment._id.toString(), actor);
        }
        for (const creditNote of creditNotes) {
          await this.creditNotesService.remove(creditNote._id.toString(), actor);
        }
      }
      try {
        await this.invoicesService.remove(invoiceId, actor);
      } catch (err) {
        // A booking pointing at an invoice that's already gone (deleted
        // some other way) has nothing left to guard -- don't let that block
        // deleting the booking itself. A real blocker (payments/credit
        // notes still recorded against an invoice that DOES exist) throws
        // ConflictException, which still propagates and blocks as normal.
        if (!(err instanceof NotFoundException)) throw err;
      }
    }
    if (booking.stayId) {
      await this.dayBookingsService.removeStay(booking.stayId);
    }
    await this.boardingBookingModel.findByIdAndDelete(id).exec();
  }

  // Requests either a deposit (existing InvoicesService.requestDeposit(), the
  // configured Settings > Deposit percentage) or the full balance -- staff
  // choose one from the Booking Detail page once the invoice exists,
  // matching your "Add the option on the booking to request full payment"
  // requirement. Unlike a plain quote's accept flow, nothing is requested
  // automatically (see QuotesService.acceptAndConvert()).
  async requestPayment(id: string, type: 'deposit' | 'full', actor = 'Staff') {
    const booking = await this.boardingBookingModel.findById(id).exec();
    if (!booking) throw new NotFoundException(`Boarding booking ${id} not found`);
    if (!booking.invoice) throw new BadRequestException('This booking has no invoice yet.');
    const invoiceId = booking.invoice.toString();
    const result =
      type === 'deposit'
        ? await this.invoicesService.requestDeposit(invoiceId, actor)
        : await this.invoicesService.requestFullPayment(invoiceId, actor);
    booking.paymentRequestType = type;
    await booking.save();
    return result;
  }

  // Deletes the stay's current DayBooking rows, recreates them for the new
  // dates under the SAME stayId, then recalculates the linked invoice's line
  // items -- InvoicesService.update()'s calculateTotals() already leaves
  // amountPaid untouched, which is exactly "the deposit stays fixed and is
  // absorbed" (nothing is refunded/reissued, the balance just moves).
  async amendDates(id: string, dto: AmendBoardingBookingDatesDto): Promise<BoardingBooking> {
    const booking = await this.boardingBookingModel.findById(id).exec();
    if (!booking) throw new NotFoundException(`Boarding booking ${id} not found`);
    if (!booking.invoice) throw new BadRequestException('This booking has no invoice yet.');
    const invoiceId = booking.invoice.toString();
    const invoice = await this.invoicesService.findOne(invoiceId);
    const animalIds = booking.animals.map((a) => this.idOf(a));
    if (booking.stayId) {
      await this.dayBookingsService.removeStay(booking.stayId);
    }
    const endDate = booking.type === 'dayCare' ? dto.startDate : dto.endDate ?? dto.startDate;
    let bookings: DayBooking[];
    if (booking.type === 'dayCare') {
      const dropOffPeriod = dto.dropOffPeriod ?? 'AM';
      const collectionPeriod = dto.collectionPeriod ?? 'PM';
      ({ bookings } = await this.dayBookingsService.createDayCareStay(
        {
          animals: animalIds,
          date: dto.startDate,
          dropOffPeriod,
          dropOffTime: dto.dropOffTime,
          collectionPeriod,
          collectionTime: dto.pickUpTime,
        },
        invoiceId,
      ));
    } else {
      ({ bookings } = await this.dayBookingsService.createBoardingStay(
        {
          animals: animalIds,
          startDate: dto.startDate,
          dropOffTime: dto.dropOffTime,
          endDate,
          pickUpTime: dto.pickUpTime,
        },
        invoiceId,
      ));
    }
    // Rows keep their original stayId conceptually (same stay, just amended)
    // -- createDayCareStay/createBoardingStay always mint a fresh one, so
    // adopt it as this booking's new stayId rather than trying to force the
    // old value back onto the new rows.
    const newStayId = bookings[0]?.stayId as unknown as string;
    const lineItems = this.buildLineItems(bookings);
    if (lineItems.length === 0) {
      throw new BadRequestException('No priced products resolved for the new dates -- check Settings > Bookings.');
    }
    const newTotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
    if (newTotal < (invoice.amountPaid ?? 0)) {
      throw new BadRequestException(
        `The new dates would bring this invoice's total below the £${(invoice.amountPaid ?? 0).toFixed(2)} already paid -- amend to a stay that covers at least that much, or handle the difference as a refund/credit note first.`,
      );
    }
    await this.invoicesService.update(invoiceId, { lineItems }, 'Staff');
    booking.startDate = dto.startDate;
    booking.dropOffTime = dto.dropOffTime;
    booking.endDate = endDate;
    booking.pickUpTime = dto.pickUpTime;
    booking.stayId = newStayId;
    return booking.save();
  }

  async recordCheckIn(id: string, submissionId: string, staffName: string): Promise<BoardingBooking> {
    const booking = await this.boardingBookingModel.findById(id).exec();
    if (!booking) throw new NotFoundException(`Boarding booking ${id} not found`);
    booking.checkInSubmission = submissionId as unknown as BoardingBooking['checkInSubmission'];
    booking.checkInAt = new Date();
    booking.checkInBy = staffName;
    return booking.save();
  }

  async recordCheckOut(id: string, submissionId: string, staffName: string): Promise<BoardingBooking> {
    const booking = await this.boardingBookingModel.findById(id).exec();
    if (!booking) throw new NotFoundException(`Boarding booking ${id} not found`);
    booking.checkOutSubmission = submissionId as unknown as BoardingBooking['checkOutSubmission'];
    booking.checkOutAt = new Date();
    booking.checkOutBy = staffName;
    return booking.save();
  }

  // Manual resend, and the target of the cron below -- creates the
  // pre-check-in FormSubmission (using whichever Boarding/Day Care form is
  // configured in Settings > Boarding) and emails the intake link, same
  // "generate + immediately email" flow SendFormModal drives interactively
  // for a staff-initiated form send.
  async sendPreCheckIn(id: string): Promise<BoardingBooking> {
    const booking = await this.boardingBookingModel.findById(id).populate('customer', 'name email').exec();
    if (!booking) throw new NotFoundException(`Boarding booking ${id} not found`);
    const customer = booking.customer as unknown as { _id?: unknown; name?: string; email?: string };
    if (!customer?.email) {
      throw new BadRequestException('This customer has no email address on file.');
    }
    const workflow = await this.settingsService.getBoardingWorkflowSettings();
    const formId = booking.type === 'boarding' ? workflow.preCheckInFormBoarding : workflow.preCheckInFormDayCare;
    if (!formId) {
      throw new BadRequestException(
        `No pre-check-in form is configured for ${booking.type === 'boarding' ? 'Boarding' : 'Day Care'} yet -- set one in Settings > Boarding first.`,
      );
    }
    // A minimal, direct port of FormSubmissionsService.create() -- kept local
    // (rather than importing FormSubmissionsModule) to avoid a circular
    // module dependency: FormSubmissionsModule already imports CustomersModule,
    // which sits upstream of this module via Customers -> Animals -> Bookings ->
    // Quotes -> BoardingBookings (see boarding-bookings.module.ts). Unlike
    // FormSubmissionsService.create()'s per-pet field WRAPPING (for a form
    // with no group of its own), this shapes the form's OWN "Pet" group to
    // this booking's animals via shapeSnapshotForBooking() below, and
    // pre-fills answers from the live Customer/Animal records so the
    // customer reviews/corrects rather than retypes everything.
    const form = await this.formsService.findOne(String(formId));
    const animalIds = booking.animals.map((a) => this.idOf(a));
    const [fullCustomer, animalDocs] = await Promise.all([
      this.customerModel.findById(customer._id).exec(),
      Promise.all(animalIds.map((animalId) => this.animalModel.findById(animalId).exec())),
    ]);
    const animals = animalDocs.filter((a): a is NonNullable<typeof a> => a !== null);
    const formFieldsSnapshot = shapeSnapshotForBooking(
      form.fields as unknown as FormField[],
      booking.reference,
      animals.map((a) => a.name),
    );
    const answers = fullCustomer
      ? buildPreCheckInAnswers(
          formFieldsSnapshot,
          fullCustomer.toObject() as unknown as Record<string, unknown>,
          animals.map((a) => a.toObject() as unknown as Record<string, unknown>),
        )
      : {};
    const submission = await new this.formSubmissionModel({
      form: form._id,
      formName: form.name,
      formDescription: form.description,
      formFieldsSnapshot,
      status: FormSubmissionStatus.PENDING,
      customer: customer._id,
      animal: animalIds.length === 1 ? animalIds[0] : undefined,
      animals: animalIds.length > 1 ? animalIds : undefined,
      recipientEmail: customer.email,
      recipientName: customer.name,
      answers,
    }).save();
    const link = `${publicFrontendUrl()}/forms/${(submission._id as { toString(): string }).toString()}`;
    // Includes the booking reference (not just the fixed literal
    // 'Pre-check-in') -- this is the only thing that ends up in the
    // customer's inbox subject line (via the {{form_name}} placeholder) and
    // in the customer's own Activity log distinguishing one send from
    // another. Without it, a customer with two bookings gets two
    // identical-looking "Pre-check-in" emails and can't tell which link is
    // for which stay -- reopening an already-completed one shows as blocked
    // to them, while the *other* booking's admin view correctly still shows
    // "not filled out" (it's a different, still-pending submission), which
    // reads as a bug even though nothing is actually broken server-side.
    await this.settingsService.sendTriggeredEmail({
      trigger: EmailTrigger.FORM,
      to: customer.email,
      name: customer.name ?? customer.email,
      link,
      customerId: String(customer._id),
      formName: `Pre-check-in (${booking.reference})`,
    });
    booking.preCheckInSentAt = new Date();
    booking.preCheckInSubmission = submission._id as unknown as BoardingBooking['preCheckInSubmission'];
    return booking.save();
  }

  // Hourly look-ahead scan: no existing @Cron in this codebase looks more
  // than a few minutes ahead (InvoicesService.markOverdue(),
  // NotificationService.dailyDigest(), AppointmentsService.sendDueReminders()
  // are all narrow *now*-relative windows), so this is the first "N days
  // before X" scheduled job.
  @Cron(CronExpression.EVERY_HOUR)
  async sendDuePreCheckIns(): Promise<void> {
    const workflow = await this.settingsService.getBoardingWorkflowSettings();
    const daysBefore = workflow.preCheckInDaysBefore ?? 2;
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + daysBefore);
    const dueKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const due = await this.boardingBookingModel
      .find({
        invoice: { $exists: true },
        preCheckInSentAt: { $exists: false },
        startDate: { $lte: dueKey(cutoff) },
        checkInAt: { $exists: false },
      })
      .exec();
    for (const booking of due) {
      try {
        await this.sendPreCheckIn((booking._id as { toString(): string }).toString());
      } catch (err) {
        console.error(`Boarding booking ${booking.reference}: failed to send due pre-check-in:`, err);
      }
    }
  }

  computeStages(booking: BoardingBooking, invoice?: Invoice | null): BoardingBookingStage[] {
    const stages: BoardingBookingStage[] = [];
    if (booking.quote) {
      stages.push({ key: 'quote', label: 'Booking quote', done: true, current: false });
    }
    stages.push({ key: 'confirmed', label: 'Confirmed', done: true, current: false });
    stages.push({
      key: 'invoiceRaised',
      label: 'Invoice raised',
      done: !!booking.invoice,
      current: false,
      sub: invoice?.invoiceNumber,
    });
    const amountPaid = invoice?.amountPaid ?? 0;
    const paymentReceived = amountPaid > 0;
    stages.push({
      key: 'paymentReceived',
      label: 'Payment received',
      done: paymentReceived,
      current: false,
      sub: paymentReceived ? `£${amountPaid.toFixed(2)}` : undefined,
    });
    stages.push({
      key: 'preCheckIn',
      label: 'Pre-check-in',
      done: !!booking.preCheckInSubmission,
      current: false,
      sub: booking.preCheckInSentAt ? 'Sent' : undefined,
    });
    stages.push({ key: 'checkedIn', label: 'Checked in', done: !!booking.checkInAt, current: false });
    stages.push({
      key: 'inProgress',
      label: 'In progress',
      done: !!booking.checkOutAt,
      current: false,
    });
    stages.push({ key: 'checkedOut', label: 'Checked out', done: !!booking.checkOutAt, current: false });
    stages.push({
      key: 'invoicePaid',
      label: 'Invoice paid',
      done: invoice?.status === InvoiceStatus.PAID,
      current: false,
    });
    if (booking.statusOverride) {
      this.applyStatusOverride(stages, booking.statusOverride);
    } else {
      const firstPending = stages.findIndex((s) => !s.done);
      if (firstPending >= 0) stages[firstPending].current = true;
    }
    return stages;
  }

  // When staff pin a manual status, the Progress timeline should tell the
  // same story instead of carrying on describing the raw, un-overridden
  // field state (e.g. the pill saying "Deposit Paid" while the timeline
  // still showed "Payment received" as merely current/pending looked like
  // two different, contradicting statuses). `sub` text (invoice number,
  // amount paid, etc.) is left as computed above -- still factually true
  // regardless of which stage staff have manually marked as reached.
  private applyStatusOverride(stages: BoardingBookingStage[], override: BookingStatusLabel): void {
    const order: BoardingBookingStage['key'][] = [
      'confirmed',
      'invoiceRaised',
      'paymentReceived',
      'preCheckIn',
      'checkedIn',
      'inProgress',
      'checkedOut',
      'invoicePaid',
    ];
    // The index (into `order` above) of the last stage the given status
    // implies is DONE -- 'Deposit Requested' and 'Deposit Paid' share the
    // same underlying 'paymentReceived' stage but land on different sides
    // of it (requested-not-paid leaves it as the current/pending one).
    const doneThroughIndex: Record<BookingStatusLabel, number> = {
      Confirmed: 0,
      'Invoice Raised': 1,
      'Deposit Requested': 1,
      'Deposit Paid': 2,
      'Pre Check In Complete': 3,
      'Check In Complete': 4,
      'In Progress': 5,
      'Check Out Complete': 6,
      'Booking Complete': 7,
    };
    const threshold = doneThroughIndex[override];
    for (const stage of stages) {
      if (stage.key === 'quote') continue;
      const index = order.indexOf(stage.key);
      stage.done = index <= threshold;
      stage.current = index === threshold + 1;
    }
  }

  // Single label shown on the Bookings list and the detail header pill --
  // describes what has ACTUALLY happened so far, most-advanced-first. Not
  // derived from computeStages()'s "current" pointer: that marks the NEXT
  // (not-yet-done) stage, so using its label here made the list claim e.g.
  // "Payment received" for a booking that had only had a deposit requested,
  // not paid -- read as done when it was really just the pending step.
  // statusOverride (set via setStatus() below) always wins over the
  // automatic computation, until it's cleared back to automatic.
  //
  // "Check In Complete" vs "In Progress": both mean "checked in, not yet
  // checked out" -- the only real signal to tell them apart is whether
  // check-in happened today (a boarding stay's later days have genuinely
  // moved on to "in progress") or on an earlier day.
  statusLabel(booking: BoardingBooking, invoice?: Invoice | null): BookingStatusLabel {
    if (booking.statusOverride) return booking.statusOverride;
    if (booking.checkOutAt && invoice?.status === InvoiceStatus.PAID) return 'Booking Complete';
    if (booking.checkOutAt) return 'Check Out Complete';
    if (booking.checkInAt) {
      const today = new Date().toISOString().slice(0, 10);
      return today > booking.startDate ? 'In Progress' : 'Check In Complete';
    }
    if (booking.preCheckInSubmission) return 'Pre Check In Complete';
    const amountPaid = invoice?.amountPaid ?? 0;
    if (amountPaid > 0) return 'Deposit Paid';
    if (booking.paymentRequestType) return 'Deposit Requested';
    if (booking.invoice) return 'Invoice Raised';
    return 'Confirmed';
  }

  // findAll()/findOne() above already .populate('invoice'), so `booking.invoice`
  // is the full Invoice document, not just an id -- re-fetching it here would
  // (and, before this fix, actually did: booking.invoice.toString() on a
  // populated subdocument isn't a valid id, so InvoicesService.findOne() threw
  // and the .catch(() => null) silently produced a null invoice) be redundant
  // at best. Just use what's already there.
  withStatus(booking: BoardingBooking) {
    const invoice = (booking.invoice as unknown as Invoice) ?? null;
    const stages = this.computeStages(booking, invoice);
    return { booking, invoice, stages, status: this.statusLabel(booking, invoice) };
  }

  // Staff pinning (or clearing, via `status: null`) a manual status from the
  // Booking Detail page -- see statusOverride's doc comment on the schema.
  async setStatus(id: string, status: BookingStatusLabel | null | undefined): Promise<BoardingBooking> {
    const booking = await this.boardingBookingModel.findById(id).exec();
    if (!booking) throw new NotFoundException(`Boarding booking ${id} not found`);
    booking.statusOverride = status ?? undefined;
    return booking.save();
  }

  // Moves a booking between the Bookings tab's "Current"/"Archive" lists --
  // a display-only toggle, doesn't touch statusOverride or anything else.
  async setArchived(id: string, archived: boolean): Promise<BoardingBooking> {
    const booking = await this.boardingBookingModel.findById(id).exec();
    if (!booking) throw new NotFoundException(`Boarding booking ${id} not found`);
    booking.archived = archived;
    return booking.save();
  }
}
