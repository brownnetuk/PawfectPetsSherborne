import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Customer } from '../../customers/schemas/customer.schema';
import { Form } from '../../forms/schemas/form.schema';

export enum FormSubmissionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
}

@Schema({ timestamps: true })
export class FormSubmission extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Form.name, required: true })
  form: Types.ObjectId;

  // Snapshotted from the Form at send-time -- same reasoning as invoices
  // snapshotting paymentTerms text instead of referencing the live
  // InvoiceTerm: editing/deleting the Form later must not retroactively
  // change how an in-flight or already-completed submission renders/behaves.
  @Prop({ required: true })
  formName: string;

  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  formFieldsSnapshot: Record<string, unknown>[];

  @Prop({
    type: String,
    enum: FormSubmissionStatus,
    default: FormSubmissionStatus.PENDING,
  })
  status: FormSubmissionStatus;

  // Set at creation if sent against an existing customer, or filled in once
  // submit() resolves/creates one -- persisted immediately after the customer
  // write succeeds (before any pet writes), so a retried submit can detect
  // this is already set and switch straight to updating that customer.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name })
  customer?: Types.ObjectId;

  @Prop({ required: true })
  recipientEmail: string;

  @Prop()
  recipientName?: string;

  // Keyed by field id; a repeatable group's answer is an array of
  // per-repetition { fieldId: value } records. Kept even for fields with no
  // mapping, so the raw submission stays fully visible in the admin app even
  // though unmapped answers never get written to Customer/Animal.
  @Prop({ type: MongooseSchema.Types.Mixed })
  answers?: Record<string, unknown>;

  @Prop()
  submittedAt?: Date;
}

export const FormSubmissionSchema =
  SchemaFactory.createForClass(FormSubmission);
