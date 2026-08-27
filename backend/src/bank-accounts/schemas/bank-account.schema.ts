import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum BankAccountType {
  BANK = 'bank',
  SAVINGS = 'savings',
}

@Schema({ timestamps: true })
export class BankAccount extends Document {
  @Prop({ type: String, enum: BankAccountType, default: BankAccountType.BANK })
  type: BankAccountType;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  sortCode: string;

  @Prop({ required: true })
  accountNumber: string;

  // Kept in sync by BankAccountsService.adjustBalance() every time a Payment/
  // Expense/CreditNote is recorded, updated, or removed against this account
  // -- see backend/README.md. Reset (not incremented) by setOpeningBalance()
  // below whenever staff reconcile against a real statement.
  @Prop({ default: 0 })
  currentBalance?: number;

  // A reconciliation anchor: "as of this date, the balance was this amount" --
  // set via the Transactions panel's settings gear (setOpeningBalance()).
  // Unset means "since this account was created, balance 0", the original
  // default before reconciliation existed. getTransactions() sums from here
  // rather than from the beginning of time, so a period's own opening
  // balance stays correct after a reconciliation even if there's older,
  // now-irrelevant transaction history before it.
  @Prop()
  openingBalanceDate?: Date;

  @Prop({ default: 0 })
  openingBalance?: number;

  // At most one account has this set at a time -- BankAccountsService
  // enforces that by clearing it off every other account whenever one is
  // marked default (same pattern as InvoiceTerm.isDefault and
  // PaymentMethod.isDefault). The admin app's "New expense" form
  // pre-selects whichever account has this set.
  @Prop({ default: false })
  isDefault?: boolean;
}

export const BankAccountSchema = SchemaFactory.createForClass(BankAccount);
