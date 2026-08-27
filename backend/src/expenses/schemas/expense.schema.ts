import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { BankAccount } from '../../bank-accounts/schemas/bank-account.schema';

@Schema({ timestamps: true })
export class Expense extends Document {
  @Prop({ required: true })
  date: Date;

  // A plain string copied from the chosen ExpenseCategory's name at creation
  // time, not a live reference -- same reasoning as Payment.paymentMethod: a
  // recorded expense shouldn't retroactively change if the category library
  // entry (Settings > Finance) is later renamed or deleted. Staff manage the
  // list themselves via /expense-categories rather than a fixed schema enum.
  @Prop({ required: true })
  category: string;

  @Prop()
  payee?: string;

  // Copied from the chosen PaymentMethod's name at creation time, not a
  // reference -- same reasoning as `category` above and Payment.paymentMethod.
  @Prop()
  paymentMethod?: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  // Optional -- an expense doesn't have to be tied to a specific account
  // (e.g. petty cash), but when it is, ExpensesService debits that account's
  // currentBalance.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: BankAccount.name })
  account?: Types.ObjectId;

  // Base64 data URI, same storage approach as Animal.photos/BusinessInfo.logoImage.
  @Prop()
  receipt?: string;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);
