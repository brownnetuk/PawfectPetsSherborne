import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import type { ChecklistCategory } from './checklist-template.schema';
import { ChecklistTemplate } from './checklist-template.schema';

// One day's copy of a ChecklistTemplate -- name/items/category/completeByTime
// are snapshotted at assignment time (same "snapshot, don't live-reference"
// convention as FormSubmission.formFieldsSnapshot/Invoice.paymentTerms
// elsewhere in this app) so editing or deleting the template later never
// changes what an already-assigned day shows or silently blanks out a day's
// checklist.
@Schema({ timestamps: true })
export class ChecklistAssignment extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: ChecklistTemplate.name, required: true })
  template: Types.ObjectId;

  // Defaulted for the same reason as ChecklistTemplate.category -- an
  // assignment snapshotted from a pre-migration template would otherwise
  // fail to save with no category to copy.
  @Prop({ type: String, enum: ['boarding', 'dayCare'], required: true, default: 'boarding' })
  category: ChecklistCategory;

  @Prop({ required: true })
  name: string;

  @Prop()
  completeByTime?: string;

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

  // Parallel array to `items` -- the staff member who ticked each item off
  // (set server-side from the logged-in user, never client-supplied), or
  // null while unticked.
  @Prop({ type: [String], default: [] })
  completedBy: (string | null)[];

  // Free-text notes staff can add for this specific day's checklist.
  @Prop()
  notes?: string;

  // Sign-off for the whole day's checklist -- a base64 PNG from the admin's
  // signature pad, same data-URI convention used for customer agreement/
  // off-lead consent signatures. `signedBy` is set server-side from the
  // logged-in user, never client-supplied.
  @Prop()
  signatureImage?: string;

  @Prop()
  signedBy?: string;

  @Prop()
  signedAt?: Date;
}

export const ChecklistAssignmentSchema = SchemaFactory.createForClass(ChecklistAssignment);
