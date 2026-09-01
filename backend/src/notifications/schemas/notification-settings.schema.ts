import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Singleton-style config (one document, same pattern as VisitMapping /
// BusinessInfo) controlling which push notifications the app sends.
@Schema({ timestamps: true })
export class NotificationSettings extends Document {
  // Customer moved Pending -> Active.
  @Prop({ default: true })
  customerActivated: boolean;

  // Appointment reminder, sent this many minutes before it starts.
  @Prop({ default: true })
  appointmentReminders: boolean;

  @Prop({ default: 60, min: 1 })
  appointmentLeadMinutes: number;

  // Once-a-day summary of the day's bookings, sent at dailyDigestTime ('HH:mm').
  @Prop({ default: false })
  dailyDigest: boolean;

  @Prop({ default: '07:30' })
  dailyDigestTime: string;

  // An invoice flipped to overdue.
  @Prop({ default: true })
  invoicesOverdue: boolean;

  // A customer opened (read) an invoice email.
  @Prop({ default: true })
  invoicesRead: boolean;

  // Internal dedup for the daily digest: the last local date ('YYYY-MM-DD')
  // a digest went out, so the 5-minutely cron only sends once per day.
  @Prop()
  lastDigestSentOn?: string;
}

export const NotificationSettingsSchema = SchemaFactory.createForClass(NotificationSettings);
