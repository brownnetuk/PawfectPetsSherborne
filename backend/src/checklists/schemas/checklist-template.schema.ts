import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// A reusable, named list of tasks (e.g. "Morning Boarding Round" -> "Feed",
// "Fresh water", "Let out for a toilet break") -- staff assign a copy of one
// to a specific day (see ChecklistAssignment) rather than filling this one
// in directly, so the same template can be reused across many days.
@Schema({ timestamps: true })
export class ChecklistTemplate extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ type: [String], default: [] })
  items: string[];
}

export const ChecklistTemplateSchema = SchemaFactory.createForClass(ChecklistTemplate);
