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

// Mirror of the quote's QuoteVisitPlan (quotes/schemas/quote.schema.ts) --
// copied onto the invoice when an accepted quote converts, so the rendered
// invoice can show the visit schedule. Defined here rather than imported to
// avoid a circular schema import (quote.schema already imports Invoice).
@Schema({ _id: false })
export class InvoiceVisitPlan {
  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'Animal', required: true })
  animals: Types.ObjectId[];

  @Prop({ required: true })
  startDate: string;

  @Prop({ required: true })
  endDate: string;

  @Prop({ required: true, enum: ['1', '2'] })
  visitsPerDay: string;

  @Prop({ required: true, enum: ['1', '2'] })
  visitsFirstDay: string;

  @Prop({ required: true, enum: ['1', '2'] })
  visitsLastDay: string;
}
const InvoiceVisitPlanSchema = SchemaFactory.createForClass(InvoiceVisitPlan);

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

  // Running total of Payment records applied against this invoice -- see
  // InvoicesService.applyPayment()/reversePayment(), called by PaymentsService.
  @Prop({ default: 0 })
  amountPaid?: number;

  // Stamped by GET /invoices/:id/pixel.gif (a 1x1 tracking pixel appended to
  // the sent email body) the first time the customer's mail client loads it --
  // an "opened" signal shown as a separate badge alongside status, not a
  // status value itself, since being opened has no bearing on where an
  // invoice actually sits in its draft/sent/paid/overdue/cancelled lifecycle.
  @Prop()
  openedAt?: Date;

  @Prop({ type: InvoiceVisitPlanSchema })
  visitPlan?: InvoiceVisitPlan;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
