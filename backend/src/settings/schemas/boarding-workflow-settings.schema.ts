import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Form } from '../../forms/schemas/form.schema';

// Singleton-style collection, same pattern as VisitMapping/BusinessInfo:
// exactly one document holds Settings > Boarding's Pre-check-in/Check-in/
// Check-out/Incident report/Customer risk assessment cards -- which Form (from the dynamic Forms builder) each stage
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

  // The form staff fill in from a booking's Incident Reports card -- one for
  // both Boarding and Day Care (nothing in an incident is stay-type
  // specific). Pointed at the seeded "Incident Report" form on first boot
  // (FormsService.seedIncidentReportForm()).
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Form.name })
  incidentReportForm?: Types.ObjectId;

  // The form staff fill in for a customer's dog(s) from Risk Assessments >
  // Customer Risk Assessments. Pointed at the seeded "New Dog Intake Risk
  // Assessment" form on first boot (FormsService.seedPickedForm()).
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Form.name })
  customerRiskAssessmentForm?: Types.ObjectId;
}

export const BoardingWorkflowSettingsSchema = SchemaFactory.createForClass(BoardingWorkflowSettings);
