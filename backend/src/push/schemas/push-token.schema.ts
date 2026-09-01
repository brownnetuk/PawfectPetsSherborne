import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A registered device push token (one per install). Staff app is internal, so
// staff reminders go to every staff device; `staff` is kept only for reference.
// A token belonging to the customer portal app instead carries `customer` (the
// customer id) and none of `staff` — this is how sends are routed to the right
// audience and the right APNs topic (see PushService/ApnsService).
@Schema({ timestamps: true })
export class PushToken extends Document {
  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ default: 'ios' })
  platform: string;

  @Prop()
  staff?: string;

  // Set only for customer-portal-app tokens (the customer's id).
  @Prop({ index: true })
  customer?: string;
}

export const PushTokenSchema = SchemaFactory.createForClass(PushToken);
