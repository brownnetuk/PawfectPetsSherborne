import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A reusable library of vet practices, staff-managed (Settings > Business
// Info), matching Customer.emergencyVet's field set minus the per-customer
// authorisation signature. The intake form's Vet Practice step lists these
// and, when one is picked, copies its fields into the form -- same
// "copy at selection time, not a live reference" reasoning as
// Payment.paymentMethod: a customer's saved vet details shouldn't
// retroactively change if this library entry is later edited.
@Schema({ timestamps: true })
export class VetPractice extends Document {
  @Prop({ required: true })
  practiceName: string;

  @Prop({ required: true })
  address1: string;

  @Prop()
  address2?: string;

  @Prop({ required: true })
  town: string;

  @Prop()
  county?: string;

  @Prop({ required: true })
  postcode: string;

  @Prop({ required: true })
  telephone: string;

  @Prop()
  email?: string;
}

export const VetPracticeSchema = SchemaFactory.createForClass(VetPractice);
