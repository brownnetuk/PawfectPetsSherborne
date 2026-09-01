import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A stored notification for the admin app's notification centre (the bell).
// Every notification that's dispatched (and pushed to phones) is also saved
// here so the admin can show a feed with an unread indicator.
@Schema({ timestamps: true })
export class NotificationItem extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop()
  type?: string;

  @Prop({ default: false, index: true })
  read: boolean;
}

export const NotificationItemSchema = SchemaFactory.createForClass(NotificationItem);
