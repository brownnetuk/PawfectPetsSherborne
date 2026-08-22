import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { BankAccount } from '../../bank-accounts/schemas/bank-account.schema';

export enum ExpenseCategory {
  INSURANCE = 'insurance',
  SUPPLIES = 'supplies',
  EQUIPMENT = 'equipment',
  VEHICLE_FUEL = 'vehicle_fuel',
  VETERINARY = 'veterinary',
  MARKETING = 'marketing',
  PROFESSIONAL_FEES = 'professional_fees',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class Expense extends Document {
  @Prop({ required: true })
  date: Date;

  @Prop({ type: String, enum: ExpenseCategory, required: true })
  category: ExpenseCategory;

  @Prop()
  payee?: string;

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
