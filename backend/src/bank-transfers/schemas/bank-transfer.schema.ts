import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { BankAccount } from '../../bank-accounts/schemas/bank-account.schema';

// Moves money between two of the business's own accounts -- BankTransfersService
// debits `fromAccount` and credits `toAccount` by `amount` when one is created
// (and reverses both when one is deleted), same adjustBalance() mechanism
// Payments/Expenses/CreditNotes already use.
@Schema({ timestamps: true })
export class BankTransfer extends Document {
  @Prop({ required: true })
  date: Date;

  @Prop()
  reference?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: BankAccount.name, required: true })
  fromAccount: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: BankAccount.name, required: true })
  toAccount: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;
}

export const BankTransferSchema = SchemaFactory.createForClass(BankTransfer);
