import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Customer } from '../../customers/schemas/customer.schema';
import { Staff } from '../../staff/schemas/staff.schema';

// One row per customer a bulk email was sent to -- unlike PushMessageRecipient
// (@Schema({_id: false})), this keeps its own _id: the read-tracking pixel
// route (EmailMessagesController's GET .../recipients/:recipientId/pixel.gif)
// needs to address one specific row directly, one email per recipient (never
// a single BCC'd send) so nobody's address is visible to anyone else, and so
// each has its own unique tracking pixel URL to know who specifically opened it.
@Schema()
export class EmailMessageRecipient {
  _id: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name, required: true })
  customer: Types.ObjectId;

  // Snapshotted at send time so the recipient list still reads correctly even
  // if the customer's email later changes.
  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop({ type: String, enum: ['sent', 'failed'], required: true })
  status: 'sent' | 'failed';

  @Prop()
  reason?: string;

  @Prop()
  openedAt?: Date;
}
export const EmailMessageRecipientSchema = SchemaFactory.createForClass(EmailMessageRecipient);

// A bulk email composed and sent from Communications > Email -- persisted so
// staff can see it as a task: what was sent, to whom, and who's read it.
@Schema({ timestamps: true })
export class EmailMessage extends Document {
  @Prop({ required: true })
  subject: string;

  // Rich HTML from the compose screen's editor -- becomes the "Generic Email"
  // template's {{emailBodyText}} placeholder for every recipient (see
  // EmailMessagesService.send()).
  @Prop({ required: true })
  bodyHtml: string;

  @Prop({ type: [EmailMessageRecipientSchema], required: true })
  recipients: EmailMessageRecipient[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Staff.name })
  sentBy?: Types.ObjectId;
}

export const EmailMessageSchema = SchemaFactory.createForClass(EmailMessage);
