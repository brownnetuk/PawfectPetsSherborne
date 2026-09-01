import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A named-date list staff maintain so bank-holiday-restricted products
// (Settings > Invoices > Products) know which calendar days count as a bank
// holiday, for both the Bookings calendar and invoice/quote line item picks.
@Schema({ timestamps: true })
export class BankHoliday extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  date: Date;
}

export const BankHolidaySchema = SchemaFactory.createForClass(BankHoliday);
