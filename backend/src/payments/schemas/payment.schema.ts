import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { BankAccount } from '../../bank-accounts/schemas/bank-account.schema';
import { Invoice } from '../../invoices/schemas/invoice.schema';

@Schema({ timestamps: true })
export class Payment extends Document {
  @Prop({ required: true, unique: true })
  paymentId: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Invoice.name, required: true, index: true })
  invoice: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ min: 0, default: 0 })
  charges?: number;

  // Copied from the chosen PaymentMethod's name at creation time, not a
  // reference -- same reasoning as Invoice.paymentTerms: a recorded payment
  // shouldn't retroactively change if the method library entry is edited
  // (or deleted) later.
  @Prop()
  paymentMethod?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: BankAccount.name, required: true })
  account: Types.ObjectId;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
