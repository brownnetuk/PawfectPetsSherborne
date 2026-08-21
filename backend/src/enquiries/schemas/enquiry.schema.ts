import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A prospective customer's initial contact (phone call, walk-in, etc.) --
// deliberately separate from Customer: an enquiry doesn't yet have most of
// what a real Customer record requires (emergency contact/vet, agreement),
// and may never become one. Staff log it here, then create a proper
// customer lead separately if/when it's worth following up.
export enum EnquiryService {
  DOG_WALKING = 'dog_walking',
  PET_VISITS = 'pet_visits',
  BOARDING = 'boarding',
  DAY_CARE = 'day_care',
}

@Schema({ timestamps: true })
export class Enquiry extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  email?: string;

  @Prop()
  address?: string;

  @Prop()
  phone?: string;

  @Prop()
  howHeard?: string;

  @Prop({ type: [String], enum: EnquiryService, default: [] })
  servicesInterested: EnquiryService[];

  @Prop()
  notes?: string;
}

export const EnquirySchema = SchemaFactory.createForClass(Enquiry);
