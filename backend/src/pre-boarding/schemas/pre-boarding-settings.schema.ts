import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

// Singleton-style collection, same pattern as BoardingWorkflowSettings:
// exactly one document holds Settings > Pre-Boarding.
@Schema({ timestamps: true })
export class PreBoardingSettings extends Document {
  // A dog is fit for boarding when its total concern score is at or below
  // this figure (and it picked no auto-fail answer).
  @Prop({ default: 10 })
  maxScore: number;

  // Staff-authored, loosely validated -- see pre-boarding.types.ts's
  // PreBoardingQuestion for the real shape.
  @Prop({ type: [MongooseSchema.Types.Mixed], default: undefined })
  questions?: Record<string, unknown>[];
}

export const PreBoardingSettingsSchema =
  SchemaFactory.createForClass(PreBoardingSettings);
