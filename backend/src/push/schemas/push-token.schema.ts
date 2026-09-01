import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A registered device push token (one per install). Staff app is internal, so
// reminders go to every registered device; `staff` is kept only for reference.
@Schema({ timestamps: true })
export class PushToken extends Document {
  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ default: 'ios' })
  platform: string;

  @Prop()
  staff?: string;
}

export const PushTokenSchema = SchemaFactory.createForClass(PushToken);
