import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class Form extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  // Staff-authored, loosely validated at the DTO level (same technique as
  // BusinessInfo.invoicePdfTemplate) -- see form-field.types.ts for the real
  // shape this is interpreted as by form-submissions.
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] })
  fields: Record<string, unknown>[];
}

export const FormSchema = SchemaFactory.createForClass(Form);
