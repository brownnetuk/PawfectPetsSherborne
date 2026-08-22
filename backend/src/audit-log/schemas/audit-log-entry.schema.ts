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
  QUOTE_CREATED = 'quote_created',
  QUOTE_UPDATED = 'quote_updated',
  QUOTE_EMAILED = 'quote_emailed',
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

  // payment_received only -- the sole source the income chart sums from.
  @Prop()
  amount?: number;

  // Staff name, 'Customer' (public intake form), or 'System' (no request
  // context -- nothing currently logs this way, kept meaningful for when
  // something eventually does, e.g. a future scheduled job).
  @Prop({ required: true, default: 'System' })
  actor: string;
}

export const AuditLogEntrySchema = SchemaFactory.createForClass(AuditLogEntry);
