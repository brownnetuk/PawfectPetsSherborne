import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Animal } from '../../animals/schemas/animal.schema';
import { Customer } from '../../customers/schemas/customer.schema';

export enum ServiceType {
  BOARDING = 'boarding',
  DAYCARE = 'daycare',
  GROOMING = 'grooming',
  WALKING = 'walking',
}

export enum BookingStatus {
  REQUESTED = 'requested',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class Booking extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name, required: true, index: true })
  customer: Types.ObjectId;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: Animal.name, required: true })
  animals: Types.ObjectId[];

  @Prop({ type: String, enum: ServiceType, required: true })
  serviceType: ServiceType;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ type: String, enum: BookingStatus, default: BookingStatus.REQUESTED })
  status: BookingStatus;

  @Prop()
  notes?: string;

  @Prop()
  price?: number;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
