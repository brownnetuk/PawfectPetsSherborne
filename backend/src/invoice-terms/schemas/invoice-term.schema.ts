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

  // How many days after the invoice/quote's issue date its due date/valid-until
  // date falls -- the admin app's "New invoice"/"New quote" forms use this to
  // auto-fill that date when staff pick this term. Ignored (and left unset)
  // when endOfMonth is true.
  @Prop()
  plusDays?: number;

  // When true, this term's due date is always the last working day of the
  // issue date's month, regardless of plusDays -- a fixed day-count doesn't
  // make sense for "end of month" since months have different lengths.
  @Prop({ default: false })
  endOfMonth?: boolean;

  // At most one term has this set at a time -- InvoiceTermsService enforces
  // that by clearing it off every other term whenever one is marked default.
  // The admin app's "New invoice"/"New quote" forms pre-select whichever term
  // has this set.
  @Prop({ default: false })
  isDefault?: boolean;
}

export const InvoiceTermSchema = SchemaFactory.createForClass(InvoiceTerm);
