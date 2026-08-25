import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Booking } from '../../bookings/schemas/booking.schema';
import { Customer } from '../../customers/schemas/customer.schema';
import { Invoice } from '../../invoices/schemas/invoice.schema';

export enum QuoteStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  EXPIRED = 'expired',
}

@Schema({ _id: false })
class LineItem {
  @Prop({ required: true })
  description: string;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ min: 0, max: 100, default: 0 })
  discountPercent?: number;
}
const LineItemSchema = SchemaFactory.createForClass(LineItem);

// Mirrors Invoice (../../invoices/schemas/invoice.schema.ts) field-for-field
// except dueDate -> validUntil -- a quote hasn't been billed yet, so "due" has
// no meaning; "valid until" does.
@Schema({ timestamps: true })
export class Quote extends Document {
  // Optional -- absent for a quote raised against a "Manual Customer"
  // (manualCustomerName/manualCustomerEmail below) that isn't a real Customer
  // record yet. QuotesService.update() resolves or creates a real Customer
  // and fills this in the moment the quote is marked accepted.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name, index: true })
  customer?: Types.ObjectId;

  // Set instead of `customer` for a manual/placeholder customer -- kept
  // afterward even once `customer` is filled in on acceptance, as a record
  // of what staff originally typed in.
  @Prop()
  manualCustomerName?: string;

  @Prop()
  manualCustomerEmail?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Booking.name })
  booking?: Types.ObjectId;

  @Prop({ required: true, unique: true })
  quoteNumber: string;

  @Prop({ type: [LineItemSchema], required: true })
  lineItems: LineItem[];

  @Prop({ required: true, min: 0, default: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  total: number;

  @Prop({ type: String, enum: QuoteStatus, default: QuoteStatus.DRAFT })
  status: QuoteStatus;

  @Prop({ required: true })
  issueDate: Date;

  @Prop({ required: true })
  validUntil: Date;

  // Copied in from an InvoiceTerm at creation time, same as Invoice.paymentTerms.
  @Prop()
  paymentTerms?: string;

  @Prop()
  subject?: string;

  // See Invoice.openedAt (../../invoices/schemas/invoice.schema.ts) -- same
  // tracking-pixel mechanism, GET /quotes/:id/pixel.gif.
  @Prop()
  openedAt?: Date;

  // Set once this quote is accepted (via the public quote page) and
  // converted into a real Invoice -- QuotesService.acceptAndConvert() checks
  // this first so re-accepting an already-accepted quote (e.g. a page
  // refresh, or two tabs) reuses the existing invoice instead of creating a
  // duplicate.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Invoice.name })
  invoice?: Types.ObjectId;
}

export const QuoteSchema = SchemaFactory.createForClass(Quote);
