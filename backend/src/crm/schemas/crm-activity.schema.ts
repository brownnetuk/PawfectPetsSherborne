import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Customer } from '../../customers/schemas/customer.schema';

export enum ActivityType {
  NOTE = 'note',
  CALL = 'call',
  EMAIL = 'email',
  TASK = 'task',
  STATUS_CHANGE = 'status_change',
}

@Schema({ timestamps: true })
export class CrmActivity extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Customer.name, required: true, index: true })
  customer: Types.ObjectId;

  @Prop({ type: String, enum: ActivityType, required: true })
  type: ActivityType;

  @Prop({ required: true })
  subject: string;

  @Prop()
  description?: string;

  @Prop()
  dueDate?: Date;

  @Prop({ default: false })
  completed: boolean;

  @Prop({ required: true })
  createdBy: string;

  // Base64 data-URL images (scans/photos) attached to the note. Stripped
  // from list responses (see CrmService.findAll) so note lists stay light;
  // fetched via GET /crm/activities/:id when a note is opened.
  @Prop({ type: [String], default: undefined })
  attachments?: string[];

  // Maintained alongside `attachments` on create/update so lists can show a
  // paperclip without carrying the image payloads themselves.
  @Prop({ default: 0 })
  attachmentCount: number;
}

export const CrmActivitySchema = SchemaFactory.createForClass(CrmActivity);
