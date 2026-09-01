import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A named date-range list staff maintain to block the Bookings calendar off
// entirely -- unlike BankHoliday (a single day that just changes which
// product applies), an AnnualLeave range prevents any booking at all on its
// days, so the frontend can put a red X across those calendar squares.
@Schema({ timestamps: true })
export class AnnualLeave extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;
}

export const AnnualLeaveSchema = SchemaFactory.createForClass(AnnualLeave);
