import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Customer } from '../../customers/schemas/customer.schema';

// A customer-facing notification, persisted so the customer app's bell can list
// past pushes (a push alone is ephemeral). Mirrors the staff NotificationItem
// feed, but scoped per customer.
@Schema({ timestamps: true })
export class CustomerNotification extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: Customer.name,
    required: true,
    index: true,
  })
  customer: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  // e.g. invoiceReceived | invoiceUpdated | quoteReceived | quoteUpdated |
  // message | test — the app uses this to decide where a tap goes.
  @Prop()
  type?: string;

  // Optional reference (e.g. the invoice/quote number).
  @Prop()
  reference?: string;

  @Prop({ default: false })
  read: boolean;
}

export const CustomerNotificationSchema =
  SchemaFactory.createForClass(CustomerNotification);
