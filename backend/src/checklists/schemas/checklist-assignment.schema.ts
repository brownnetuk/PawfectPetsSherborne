import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { ChecklistTemplate } from './checklist-template.schema';

// One day's copy of a ChecklistTemplate -- name/items are snapshotted at
// assignment time (same "snapshot, don't live-reference" convention as
// FormSubmission.formFieldsSnapshot/Invoice.paymentTerms elsewhere in this
// app) so editing or deleting the template later never changes what an
// already-assigned day shows or silently blanks out a day's checklist.
@Schema({ timestamps: true })
export class ChecklistAssignment extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: ChecklistTemplate.name, required: true })
  template: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ type: [String], required: true })
  items: string[];

  // Local calendar date this checklist is assigned to (stored the same
  // local-midnight way DayBooking.date is, so date-range queries behave
  // consistently across this app).
  @Prop({ required: true })
  date: Date;

  // Parallel array to `items` -- which of that day's items are ticked off.
  // Same length as `items`; a newly-assigned checklist starts all-false.
  @Prop({ type: [Boolean], default: [] })
  completed: boolean[];
}

export const ChecklistAssignmentSchema = SchemaFactory.createForClass(ChecklistAssignment);
