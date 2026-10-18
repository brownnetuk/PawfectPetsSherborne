import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { BankAccount } from '../../bank-accounts/schemas/bank-account.schema';

// Money received that isn't against an invoice -- a supplier refund, bank
// interest and the like. Credits `account` the same way a Payment does, but
// has no invoice/customer side-effects, so it lives in its own collection
// rather than making Payment.invoice optional.
@Schema({ timestamps: true, collection: 'otherincome' })
export class OtherIncome extends Document {
  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  receivedFrom: string;

  @Prop()
  description?: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: BankAccount.name, required: true })
  account: Types.ObjectId;
}

export const OtherIncomeSchema = SchemaFactory.createForClass(OtherIncome);
