import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Customer } from '../../customers/schemas/customer.schema';

// One message in a staff <-> customer conversation. A "conversation" is simply
// all messages sharing a customer. Two read flags track unread state from each
// side independently (readByStaff / readByCustomer), rather than a single
// readAt, so both the admin badge and the customer-app badge stay accurate.
@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Customer.name,
    required: true,
    index: true,
  })
  customer: Types.ObjectId;

  @Prop({ required: true, enum: ['staff', 'customer'] })
  sender: 'staff' | 'customer';

  // The staff member's name, or the customer's name — snapshotted for display.
  @Prop()
  senderName?: string;

  @Prop({ required: true })
  body: string;

  @Prop({ default: false })
  readByStaff: boolean;

  @Prop({ default: false })
  readByCustomer: boolean;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
