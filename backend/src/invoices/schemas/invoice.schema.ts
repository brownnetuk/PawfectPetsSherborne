import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Booking } from '../../bookings/schemas/booking.schema';
import { Customer } from '../../customers/schemas/customer.schema';

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
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

@Schema({ timestamps: true })
export class Invoice extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name, required: true, index: true })
  customer: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Booking.name })
  booking?: Types.ObjectId;

  @Prop({ required: true, unique: true })
  invoiceNumber: string;

  @Prop({ type: [LineItemSchema], required: true })
  lineItems: LineItem[];

  @Prop({ required: true, min: 0, default: 0 })
  subtotal: number;

  @Prop({ required: true, min: 0, default: 0 })
  total: number;

  @Prop({ type: String, enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  // Copied in from an InvoiceTerm at creation time, not a reference to one --
  // an issued invoice shouldn't retroactively change if the term library
  // entry it was picked from is later edited.
  @Prop()
  paymentTerms?: string;

  @Prop()
  subject?: string;

  @Prop({ required: true })
  issueDate: Date;

  @Prop({ required: true })
  dueDate: Date;

  @Prop()
  paidAt?: Date;

  // Stamped by GET /invoices/:id/pixel.gif (a 1x1 tracking pixel appended to
  // the sent email body) the first time the customer's mail client loads it --
  // an "opened" signal shown as a separate badge alongside status, not a
  // status value itself, since being opened has no bearing on where an
  // invoice actually sits in its draft/sent/paid/overdue/cancelled lifecycle.
  @Prop()
  openedAt?: Date;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
