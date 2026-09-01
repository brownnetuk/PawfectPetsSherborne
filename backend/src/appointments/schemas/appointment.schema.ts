import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Customer } from '../../customers/schemas/customer.schema';

// A standalone, non-animal calendar entry (Bookings page > Add Appointment)
// -- e.g. a call or meeting with a customer, shown as a blue calendar badge
// rather than a green/yellow Walk/Visit one. Day granularity for `date`
// (normalized to local midnight by AppointmentsService, same convention as
// DayBooking), with `time` kept as a plain 'HH:mm' string -- there's no
// scheduling math done on it (no duration, no clash detection), only
// display/sort, so a plain string avoids timezone conversion entirely.
@Schema({ timestamps: true })
export class Appointment extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name, required: true, index: true })
  customer: Types.ObjectId;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true, index: true })
  date: Date;

  @Prop({ required: true })
  time: string;

  // Set once the "1 hour before" push reminder has gone out, so the reminder
  // cron only ever notifies each appointment once.
  @Prop()
  reminderSentAt?: Date;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);
