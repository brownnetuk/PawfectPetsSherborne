import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Animal } from '../../animals/schemas/animal.schema';
import { Customer } from '../../customers/schemas/customer.schema';
import { Invoice } from '../../invoices/schemas/invoice.schema';
import { Product } from '../../products/schemas/product.schema';

// One dog, one day, one product -- the calendar's unit of scheduling.
// Deliberately separate from the existing Booking model (a customer + a date
// RANGE + a list of animals + one price, used for boarding-style stays):
// that model doesn't fit "add Rosie to Thursday for a 30-minute walk"
// without a real per-day/per-animal breakdown, so rather than force it in,
// this is its own simpler entity. `customer` is denormalized from
// `animal.customer` at creation time (set server-side, not client-supplied)
// so the calendar can query/populate without a second hop through Animal.
@Schema({ timestamps: true })
export class DayBooking extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Animal.name, required: true, index: true })
  animal: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name, required: true, index: true })
  customer: Types.ObjectId;

  // Day granularity only, no time-of-day -- normalized to local midnight by
  // DayBookingsService so a whole day's entries share one exact Date value.
  @Prop({ required: true, index: true })
  date: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name, required: true })
  product: Types.ObjectId;

  @Prop({ required: true, min: 1, default: 1 })
  quantity: number;

  // Set once this day's booking has been included on a generated invoice
  // (Bookings page > Generate Invoice) -- unset means it's still billable.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Invoice.name })
  invoice?: Types.ObjectId;
}

export const DayBookingSchema = SchemaFactory.createForClass(DayBooking);
