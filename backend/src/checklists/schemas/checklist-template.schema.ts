import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChecklistCategory = 'boarding' | 'dayCare';

// A reusable, named list of tasks (e.g. "Morning Boarding Round" -> "Feed",
// "Fresh water", "Let out for a toilet break") -- staff assign a copy of one
// to a specific day (see ChecklistAssignment) rather than filling this one
// in directly, so the same template can be reused across many days.
@Schema({ timestamps: true })
export class ChecklistTemplate extends Document {
  // Which service this checklist applies to -- decides both which
  // auto-assign bookings trigger it (see ChecklistsService.autoAssignForDate)
  // and lets staff tell Boarding from Day Care checklists apart at a glance.
  @Prop({ type: String, enum: ['boarding', 'dayCare'], required: true })
  category: ChecklistCategory;

  @Prop({ required: true })
  name: string;

  // Deadline for finishing the day's checklist, e.g. "10:00" -- display only,
  // nothing enforces it.
  @Prop()
  completeByTime?: string;

  @Prop({ type: [String], default: [] })
  items: string[];

  // When true, DayBookingsService auto-creates an assignment of this
  // template on any day that gets a booking matching `category`.
  @Prop({ default: false })
  autoAssign: boolean;
}

export const ChecklistTemplateSchema = SchemaFactory.createForClass(ChecklistTemplate);
