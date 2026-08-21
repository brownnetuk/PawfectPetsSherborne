import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A small library of reusable terms staff can add to an invoice -- e.g.
// "Payment due within 14 days." Deliberately just free text, not tied to any
// invoice: adding one here doesn't attach it anywhere, it just makes it
// available to copy in when creating/editing an invoice.
@Schema({ timestamps: true })
export class InvoiceTerm extends Document {
  @Prop({ required: true })
  text: string;
}

export const InvoiceTermSchema = SchemaFactory.createForClass(InvoiceTerm);
