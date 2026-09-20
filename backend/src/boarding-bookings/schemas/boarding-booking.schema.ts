import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Animal } from '../../animals/schemas/animal.schema';
import { Customer } from '../../customers/schemas/customer.schema';
import { FormSubmission } from '../../form-submissions/schemas/form-submission.schema';
import { Invoice } from '../../invoices/schemas/invoice.schema';
import { Quote } from '../../quotes/schemas/quote.schema';

// The full set of status labels BoardingBookingsService.statusLabel() can
// show -- 'Confirmed'/'Invoice Raised' cover the gap before a payment's ever
// been requested; the rest are the labels you asked for. Staff can pin any
// of these onto statusOverride below instead of letting it auto-advance.
export const BOOKING_STATUS_LABELS = [
  'Confirmed',
  'Invoice Raised',
  'Deposit Requested',
  'Deposit Paid',
  'Pre Check In Complete',
  'Check In Complete',
  'In Progress',
  'Check Out Complete',
  'Booking Complete',
] as const;
export type BookingStatusLabel = (typeof BOOKING_STATUS_LABELS)[number];

// A genuinely new, separate entity from the legacy backend/src/bookings/
// Booking schema -- that one is still actively used by the mobile app
// (mobile/lib/api/repository.dart's listBookings/updateBookingStatus), so
// this can't repurpose it without risking breaking mobile. This is the
// reference-numbered Boarding & Day Care entity behind the
// Booking quote -> Confirmed -> Invoice raised -> Payment received ->
// Pre-check-in -> Checked in -> In progress -> Checked out -> Invoice paid
// workflow -- see BoardingBookingsService.computeStages() for how the 9
// stages are derived from the fields below rather than stored directly.
@Schema({ timestamps: true })
export class BoardingBooking extends Document {
  @Prop({ required: true, unique: true })
  reference: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name, required: true, index: true })
  customer: Types.ObjectId;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: Animal.name, required: true })
  animals: Types.ObjectId[];

  @Prop({ required: true, enum: ['boarding', 'dayCare'] })
  type: 'boarding' | 'dayCare';

  // 'YYYY-MM-DD' strings, same convention as QuoteDayCarePlan/QuoteBoardingPlan.
  @Prop({ required: true })
  startDate: string;

  @Prop({ required: true })
  dropOffTime: string;

  @Prop({ required: true })
  endDate: string;

  @Prop({ required: true })
  pickUpTime: string;

  @Prop()
  notes?: string;

  // Set only when this booking was created from an accepted quote (see
  // BoardingBookingsService.createFromQuote()) -- absent for a direct booking.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Quote.name })
  quote?: Types.ObjectId;

  // Links this booking to its DayBooking rows on the calendar (same stayId
  // convention DayBookingsService already uses).
  @Prop()
  stayId?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Invoice.name })
  invoice?: Types.ObjectId;

  // Set the first time staff request either a deposit or the full balance
  // (BoardingBookingsService.requestPayment()) -- unset means nothing's been
  // requested yet, so the Booking Detail page still offers both buttons.
  @Prop({ enum: ['deposit', 'full'] })
  paymentRequestType?: 'deposit' | 'full';

  @Prop()
  preCheckInSentAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: FormSubmission.name })
  preCheckInSubmission?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: FormSubmission.name })
  checkInSubmission?: Types.ObjectId;

  @Prop()
  checkInAt?: Date;

  @Prop()
  checkInBy?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: FormSubmission.name })
  checkOutSubmission?: Types.ObjectId;

  @Prop()
  checkOutAt?: Date;

  @Prop()
  checkOutBy?: string;

  // Unset (the default) means the status shown is computed automatically
  // from the fields above (see BoardingBookingsService.statusLabel()) --
  // set once staff manually override it from the Booking Detail page,
  // and stays pinned to that value (even across further automatic
  // progress) until cleared back to automatic or changed again.
  @Prop({ enum: BOOKING_STATUS_LABELS })
  statusOverride?: BookingStatusLabel;
}

export const BoardingBookingSchema = SchemaFactory.createForClass(BoardingBooking);
