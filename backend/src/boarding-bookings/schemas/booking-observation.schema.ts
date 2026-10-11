import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { BoardingBooking } from './boarding-booking.schema';

export const OBSERVATION_CATEGORIES = [
  'Toilet',
  'Play',
  'Medication',
  'Feed',
  'Groom',
  'General',
] as const;
export type ObservationCategory = (typeof OBSERVATION_CATEGORIES)[number];

export const MAX_OBSERVATION_PHOTOS = 5;

// A timestamped care note staff add against a Boarding & Day Care booking
// from its Booking Detail page -- as many per booking as they like. Kept in
// its own collection (not an array on BoardingBooking) since each one can
// carry up to MAX_OBSERVATION_PHOTOS base64 photos, which would otherwise
// bloat every booking list/detail fetch.
@Schema({ timestamps: true })
export class BookingObservation extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: BoardingBooking.name,
    required: true,
    index: true,
  })
  booking: Types.ObjectId;

  // Defaults to "now" in the form, but staff can change it (e.g. logging
  // something after the fact).
  @Prop({ required: true })
  observedAt: Date;

  @Prop({ required: true, enum: OBSERVATION_CATEGORIES })
  category: ObservationCategory;

  @Prop()
  description?: string;

  // Compressed JPEG data URLs (admin's compressImageToDataUrl).
  @Prop({ type: [String], default: [] })
  photos: string[];

  // Always the logged-in staff member who created it -- never taken from
  // the request body.
  @Prop({ required: true })
  observedBy: string;
}

export const BookingObservationSchema =
  SchemaFactory.createForClass(BookingObservation);
