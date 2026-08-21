import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Just a named label for now -- not yet holding an amount, date, invoice
// reference, or payment method, that's a later build.
@Schema({ timestamps: true })
export class Payment extends Document {
  @Prop({ required: true })
  name: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
