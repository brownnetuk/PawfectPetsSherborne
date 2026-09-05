import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Customer } from '../../customers/schemas/customer.schema';
import { Staff } from '../../staff/schemas/staff.schema';

// One row per customer a push was sent to when this message was sent --
// 'received' means APNs accepted the push for at least one of that
// customer's registered devices (the strongest delivery signal available
// without a client-side read receipt); 'not_received' covers both "no
// device registered" and "APNs rejected every device", with `reason`
// distinguishing the two for display.
@Schema({ _id: false })
export class PushMessageRecipient {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name, required: true })
  customer: Types.ObjectId;

  @Prop({ required: true, enum: ['received', 'not_received'] })
  status: 'received' | 'not_received';

  @Prop()
  reason?: string;

  // Set when the customer taps "Acknowledge" in the app (only relevant when the
  // parent message has acknowledgementRequired).
  @Prop()
  acknowledgedAt?: Date;
}
export const PushMessageRecipientSchema = SchemaFactory.createForClass(PushMessageRecipient);

// A push message sent to one or more customers from Communications > Push
// Messages -- persisted so staff can see it as a task: what was sent, to
// whom, and whether each customer actually received it.
@Schema({ timestamps: true })
export class PushMessage extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ type: [PushMessageRecipientSchema], required: true })
  recipients: PushMessageRecipient[];

  // When true, the customer app shows an "Acknowledge" button and staff see an
  // Acknowledged column against each recipient.
  @Prop({ default: false })
  acknowledgementRequired: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Staff.name })
  sentBy?: Types.ObjectId;
}

export const PushMessageSchema = SchemaFactory.createForClass(PushMessage);
