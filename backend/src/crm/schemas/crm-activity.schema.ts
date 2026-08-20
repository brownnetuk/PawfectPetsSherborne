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
}

export const CrmActivitySchema = SchemaFactory.createForClass(CrmActivity);
