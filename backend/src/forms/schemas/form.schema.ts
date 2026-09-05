import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Form extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  // Whether this form appears in the per-customer "Choose a form" picker.
  // Defaults to visible; staff can hide a form without deleting it.
  @Prop({ default: true })
  customerVisible: boolean;

  // Staff-authored, loosely validated at the DTO level (same technique as
  // BusinessInfo.invoicePdfTemplate) -- see form-field.types.ts for the real
  // shape this is interpreted as by form-submissions.
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  fields: Record<string, unknown>[];
}

export const FormSchema = SchemaFactory.createForClass(Form);
