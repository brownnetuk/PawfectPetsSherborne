import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Just a named label for now (e.g. "Current Account", "Savings") -- not yet
// holding actual account/sort code details or linked to recorded payments,
// that's a later build.
@Schema({ timestamps: true })
export class BankAccount extends Document {
  @Prop({ required: true })
  name: string;
}

export const BankAccountSchema = SchemaFactory.createForClass(BankAccount);
