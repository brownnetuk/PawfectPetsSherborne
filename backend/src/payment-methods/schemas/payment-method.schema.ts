import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Just a named label for now (e.g. "Bank Transfer", "Cash", "Card") -- staff pick
// from these when recording how a customer paid. Not yet linked to actual bank
// account details or payment records; that's a later build.
@Schema({ timestamps: true })
export class PaymentMethod extends Document {
  @Prop({ required: true })
  name: string;
}

export const PaymentMethodSchema = SchemaFactory.createForClass(PaymentMethod);
