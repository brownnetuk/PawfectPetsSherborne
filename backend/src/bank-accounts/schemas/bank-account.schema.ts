import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum BankAccountType {
  BANK = 'bank',
  SAVINGS = 'savings',
}

// Holds the account's own identifying details -- not yet linked to recorded
// payments (see PaymentsService), that's a later build.
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

  // Not yet derived from anything (there's no transaction ledger to sum) --
  // just defaults to 0 and is only ever displayed for now. A later build that
  // adds real transactions would compute/update this from them.
  @Prop({ default: 0 })
  currentBalance?: number;
}

export const BankAccountSchema = SchemaFactory.createForClass(BankAccount);
