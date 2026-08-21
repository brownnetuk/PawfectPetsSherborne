import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Booking } from '../../bookings/schemas/booking.schema';
import { Customer } from '../../customers/schemas/customer.schema';

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
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name, required: true, index: true })
  customer: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Booking.name })
  booking?: Types.ObjectId;

  @Prop({ required: true, unique: true })
  quoteNumber: string;

  @Prop({ type: [LineItemSchema], required: true })
  lineItems: LineItem[];

  @Prop({ required: true, min: 0, default: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  tax: number;

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
}

export const QuoteSchema = SchemaFactory.createForClass(Quote);
