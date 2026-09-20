import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Form } from '../../forms/schemas/form.schema';

// Singleton-style collection, same pattern as VisitMapping/BusinessInfo:
// exactly one document holds Settings > Boarding's Pre-check-in/Check-in/
// Check-out cards -- which Form (from the dynamic Forms builder) each stage
// uses, split by Boarding vs Day Care since the two need different fields.
@Schema({ timestamps: true })
export class BoardingWorkflowSettings extends Document {
  // How many days before drop-off BoardingBookingsService's cron sends the
  // pre-check-in link.
  @Prop({ default: 2 })
  preCheckInDaysBefore?: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Form.name })
  preCheckInFormBoarding?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Form.name })
  preCheckInFormDayCare?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Form.name })
  checkInFormBoarding?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Form.name })
  checkInFormDayCare?: Types.ObjectId;

  @Prop({ default: true })
  checkInRequirePhoto?: boolean;

  @Prop({ default: true })
  checkInRequireSignature?: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Form.name })
  checkOutFormBoarding?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Form.name })
  checkOutFormDayCare?: Types.ObjectId;

  @Prop({ default: true })
  checkOutRequireSignature?: boolean;
}

export const BoardingWorkflowSettingsSchema = SchemaFactory.createForClass(BoardingWorkflowSettings);
