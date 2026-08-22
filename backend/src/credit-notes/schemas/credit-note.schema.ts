import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { BankAccount } from '../../bank-accounts/schemas/bank-account.schema';
import { Customer } from '../../customers/schemas/customer.schema';
import { Invoice } from '../../invoices/schemas/invoice.schema';

@Schema({ timestamps: true })
export class CreditNote extends Document {
  @Prop({ required: true, unique: true })
  creditNoteNumber: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name, required: true, index: true })
  customer: Types.ObjectId;

  // Optional -- a credit note can exist without being tied to a specific
  // invoice. When present, issuing/removing it reuses
  // InvoicesService.reversePayment()/applyPayment() to keep that invoice's
  // amountPaid (and paid status) in sync.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Invoice.name })
  invoice?: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true })
  reason: string;

  // Optional -- which account the refund came out of, so it can be debited.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: BankAccount.name })
  account?: Types.ObjectId;
}

export const CreditNoteSchema = SchemaFactory.createForClass(CreditNote);
