import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Shared by RiskAssessment.reviewFrequency and RiskItem.reviewPeriod -- the
// same set of intervals applies whether it's the whole policy or a single
// hazard being scheduled for re-review.
export const REVIEW_FREQUENCIES = ['weekly', 'monthly', 'quarterly', '6-monthly', 'annually'] as const;
export type ReviewFrequency = (typeof REVIEW_FREQUENCIES)[number];

export const RISK_ASSESSMENT_STATUSES = ['draft', 'review', 'live'] as const;
export type RiskAssessmentStatus = (typeof RISK_ASSESSMENT_STATUSES)[number];

export const RESIDUAL_RISK_LEVELS = ['low', 'medium', 'high'] as const;
export type ResidualRisk = (typeof RESIDUAL_RISK_LEVELS)[number];

// A single hazard/risk row within an assessment. Kept with its own _id
// (Mongoose's default for a subdocument schema) since risk items are
// individually added/edited/removed via their own endpoints, unlike e.g.
// Invoice's LineItem which is only ever replaced as a whole array.
@Schema()
export class RiskItem {
  _id: Types.ObjectId;

  @Prop({ required: true })
  hazard: string;

  @Prop()
  whoAtRisk?: string;

  @Prop({ type: [String], default: [] })
  existingControls: string[];

  @Prop({ type: [String], default: [] })
  furtherActions: string[];

  @Prop({ required: true, min: 1, max: 5 })
  likelihood: number;

  @Prop({ required: true, min: 1, max: 5 })
  severity: number;

  // Staff's own judgement of what's left over once existing controls/further
  // actions are accounted for -- deliberately not derived from
  // likelihood*severity (that raw score is shown separately), since a
  // control can bring real-world risk down further than the raw score alone
  // implies.
  @Prop({ type: String, enum: RESIDUAL_RISK_LEVELS, required: true })
  residualRisk: ResidualRisk;

  @Prop({ type: String, enum: REVIEW_FREQUENCIES })
  reviewPeriod?: ReviewFrequency;
}
export const RiskItemSchema = SchemaFactory.createForClass(RiskItem);

// One row of an assessment's own audit trail -- shown via the "Audit" button
// (RiskAssessmentDetailModal) as a read-only history of every change made to
// the assessment or any of its risk items. Embedded directly (not the
// app-wide AuditLogEntry collection, which is hard-keyed to a Customer) since
// a risk assessment has no customer of its own.
@Schema({ _id: false })
export class RiskAssessmentAuditEntry {
  @Prop({ required: true })
  action: string;

  @Prop()
  changes?: string;

  @Prop({ required: true })
  actor: string;

  @Prop({ required: true, default: Date.now })
  at: Date;
}
export const RiskAssessmentAuditEntrySchema = SchemaFactory.createForClass(RiskAssessmentAuditEntry);

@Schema({ timestamps: true })
export class RiskAssessment extends Document {
  // 'RA{n}', assigned once on creation from BusinessInfo.riskAssessmentNextNumber
  // (see RiskAssessmentsService.create()) -- same atomic-counter convention as
  // invoice/quote/booking numbering, just without a staff-editable template
  // since there's no equivalent numbering customisation requirement here.
  @Prop({ required: true, unique: true })
  raId: string;

  // 'YYYY-MM-DD', set once on creation -- when the assessment was first drawn up.
  @Prop({ required: true })
  assessmentDate: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  regulationReference?: string;

  @Prop({ type: String, enum: REVIEW_FREQUENCIES })
  reviewFrequency?: ReviewFrequency;

  // 'YYYY-MM-DD' -- unset until "Review Policy" is used for the first time
  // (RiskAssessmentsService.reviewPolicy()).
  @Prop()
  nextReviewDate?: string;

  @Prop()
  scope?: string;

  @Prop({ type: String, enum: RISK_ASSESSMENT_STATUSES, default: 'draft' })
  status: RiskAssessmentStatus;

  @Prop({ type: [RiskItemSchema], default: [] })
  risks: RiskItem[];

  @Prop({ type: [RiskAssessmentAuditEntrySchema], default: [] })
  auditLog: RiskAssessmentAuditEntry[];
}

export const RiskAssessmentSchema = SchemaFactory.createForClass(RiskAssessment);
