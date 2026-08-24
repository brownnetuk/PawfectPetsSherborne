import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Customer } from '../../customers/schemas/customer.schema';

// Deliberately a separate model from CrmActivity (backend/src/crm/) -- that's
// a manually-authored note/call/email/task log (surfaced in the admin app as
// the "Notes" tab); this is an automatic, system-generated audit trail
// (surfaced as the "Activity" tab) that staff never write to directly.
export enum AuditEventType {
  CUSTOMER_CREATED = 'customer_created',
  CUSTOMER_UPDATED = 'customer_updated',
  INVOICE_CREATED = 'invoice_created',
  INVOICE_UPDATED = 'invoice_updated',
  INVOICE_EMAILED = 'invoice_emailed',
  INVOICE_REMOVED = 'invoice_removed',
  QUOTE_CREATED = 'quote_created',
  QUOTE_UPDATED = 'quote_updated',
  QUOTE_EMAILED = 'quote_emailed',
  QUOTE_REMOVED = 'quote_removed',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_REMOVED = 'payment_removed',
  ANIMAL_CREATED = 'animal_created',
  ANIMAL_UPDATED = 'animal_updated',
  ANIMAL_REMOVED = 'animal_removed',
  BOOKING_CREATED = 'booking_created',
  BOOKING_UPDATED = 'booking_updated',
  BOOKING_REMOVED = 'booking_removed',
  CREDIT_NOTE_ISSUED = 'credit_note_issued',
  CREDIT_NOTE_REMOVED = 'credit_note_removed',
  FORM_SUBMITTED = 'form_submitted',
  REGISTRATION_EMAIL_SENT = 'registration_email_sent',
}

@Schema({ timestamps: true })
export class AuditLogEntry extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Customer.name,
    required: true,
    index: true,
  })
  customer: Types.ObjectId;

  @Prop({ required: true, enum: AuditEventType })
  type: AuditEventType;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  // payment_received/payment_removed only -- what the income chart nets
  // together (received minus removed, per month) to stay accurate once a
  // payment recorded in error is deleted rather than double-counting it.
  @Prop()
  amount?: number;

  // Staff name, 'Customer' (public intake form), or 'System' (no request
  // context -- nothing currently logs this way, kept meaningful for when
  // something eventually does, e.g. a future scheduled job).
  @Prop({ required: true, default: 'System' })
  actor: string;

  // registration_email_sent only -- a PDF snapshot of the registration form
  // as it stood at send time, so staff can see exactly what was on file (and
  // what was sent to the customer) at each point, not just what it looks
  // like now. Base64 data: URI, same storage approach as everywhere else in
  // this codebase that keeps a file in Mongo rather than separate blob
  // storage (Customer.agreement.signatureImage, BusinessInfo.termsDocx).
  @Prop()
  attachmentData?: string;

  @Prop()
  attachmentName?: string;
}

export const AuditLogEntrySchema = SchemaFactory.createForClass(AuditLogEntry);
