import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export enum PreBoardingFormStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
}

@Schema({ timestamps: true })
export class PreBoardingForm extends Document {
  @Prop({ required: true })
  firstName: string;

  @Prop()
  surname?: string;

  @Prop({ required: true })
  email: string;

  // How many dogs the form covers. Older forms only have dogNames, so read
  // it through dogCountOf() (pre-boarding.service.ts).
  @Prop()
  dogCount?: number;

  // Filled in by the owner on submit (staff entered them on older forms).
  @Prop({ type: [String], default: [] })
  dogNames: string[];

  @Prop({
    type: String,
    enum: PreBoardingFormStatus,
    default: PreBoardingFormStatus.PENDING,
  })
  status: PreBoardingFormStatus;

  // Snapshotted from Settings at creation, same reasoning as
  // FormSubmission.formFieldsSnapshot: editing questions or scores later
  // mustn't change an in-flight or already-scored form.
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  questionsSnapshot: Record<string, unknown>[];

  @Prop({ required: true })
  maxScore: number;

  // One entry per dog, same order as dogNames: { [questionId]: { value, details } }.
  @Prop({ type: [MongooseSchema.Types.Mixed] })
  answers?: Record<string, unknown>[];

  // One PreBoardingDogResult per dog, worked out server-side on submit.
  @Prop({ type: [MongooseSchema.Types.Mixed] })
  results?: Record<string, unknown>[];

  // True only when every dog is suitable.
  @Prop()
  suitable?: boolean;

  @Prop()
  lastEmailedAt?: Date;

  @Prop()
  submittedAt?: Date;
}

export const PreBoardingFormSchema =
  SchemaFactory.createForClass(PreBoardingForm);
