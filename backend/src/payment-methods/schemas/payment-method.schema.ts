import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Just a named label for now (e.g. "Bank Transfer", "Cash", "Card") -- staff pick
// from these when recording how a customer paid, or an expense's payment
// method. Not yet linked to actual bank account details or payment records;
// that's a later build.
@Schema({ timestamps: true })
export class PaymentMethod extends Document {
  @Prop({ required: true })
  name: string;

  // At most one method has this set at a time -- PaymentMethodsService
  // enforces that by clearing it off every other method whenever one is
  // marked default (same pattern as InvoiceTerm.isDefault). The admin app's
  // "New expense" form pre-selects whichever method has this set.
  @Prop({ default: false })
  isDefault?: boolean;
}

export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);
