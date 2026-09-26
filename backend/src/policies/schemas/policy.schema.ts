import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Staff } from '../../staff/schemas/staff.schema';

// Same interval set as RiskAssessment.reviewFrequency (backend/src/risk-assessments/) --
// duplicated rather than imported since Policies and Risk Assessments are
// otherwise unrelated modules.
export const REVIEW_FREQUENCIES = ['weekly', 'monthly', 'quarterly', '6-monthly', 'annually'] as const;
export type ReviewFrequency = (typeof REVIEW_FREQUENCIES)[number];

export type PolicyStatus = 'draft' | 'published';

// One staff member's sign-off requirement against a specific PolicyVersion --
// snapshotted from the active staff list at the moment that version is
// published, so a new version always needs a fresh round of sign-offs (an
// old signature doesn't carry forward) and someone who leaves later doesn't
// retroactively vanish from what history shows was required at the time.
@Schema({ _id: false })
export class PolicySignOff {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Staff.name, required: true })
  staff: Types.ObjectId;

  @Prop({ required: true })
  staffName: string;

  @Prop()
  signedAt?: Date;

  // The name typed into the "Policy Review" confirmation modal at the moment
  // of signing -- kept as its own field (not just re-derived from staffName)
  // since it's the literal text the reviewer typed to confirm, same
  // "capture what was actually entered" reasoning as Customer.agreement.signedName.
  @Prop()
  signedName?: string;

  @Prop()
  reminderSentAt?: Date;
}
export const PolicySignOffSchema = SchemaFactory.createForClass(PolicySignOff);

// One immutable published version of a policy's content -- editing a policy
// always adds a new version (PoliciesService.publishVersion()) rather than
// overwriting the last one, so version history and past sign-off records
// stay meaningful.
@Schema()
export class PolicyVersion {
  _id: Types.ObjectId;

  @Prop({ required: true })
  version: number;

  // Rich HTML from the compose screen's editor, same convention as
  // EmailTemplate.body/RiskAssessment scope fields elsewhere in this app.
  @Prop({ required: true })
  content: string;

  @Prop()
  changeSummary?: string;

  @Prop({ required: true })
  publishedAt: Date;

  @Prop({ required: true })
  publishedBy: string;

  @Prop({ type: [PolicySignOffSchema], default: [] })
  signOffs: PolicySignOff[];
}
export const PolicyVersionSchema = SchemaFactory.createForClass(PolicyVersion);

@Schema({ _id: false })
export class PolicyAuditEntry {
  @Prop({ required: true })
  action: string;

  @Prop()
  changes?: string;

  @Prop({ required: true })
  actor: string;

  @Prop({ required: true, default: Date.now })
  at: Date;
}
export const PolicyAuditEntrySchema = SchemaFactory.createForClass(PolicyAuditEntry);

@Schema({ timestamps: true })
export class Policy extends Document {
  // 'POL{n}', assigned once on creation from BusinessInfo.policyNextNumber
  // (see PoliciesService.create()) -- same atomic-counter convention as
  // RiskAssessment.raId.
  @Prop({ required: true, unique: true })
  policyId: string;

  @Prop({ required: true })
  name: string;

  // Freeform (not a fixed enum) -- the category filter chips in the admin UI
  // are computed from whatever distinct categories currently exist, so staff
  // can introduce their own without a settings change.
  @Prop()
  category?: string;

  // A regulation/licence clause this policy addresses, e.g. "Schedule 2,
  // paragraph 5.1" -- same free-text convention as
  // RiskAssessment.regulationReference.
  @Prop()
  reference?: string;

  @Prop({ type: String, enum: ['draft', 'published'], default: 'draft' })
  status: PolicyStatus;

  @Prop({ type: String, enum: REVIEW_FREQUENCIES })
  reviewFrequency?: ReviewFrequency;

  // 'YYYY-MM-DD' -- set when the policy is first published, and again every
  // time a new version is published (PoliciesService.publishVersion()).
  @Prop()
  nextReviewDate?: string;

  // Same due-notification dedup convention as RiskAssessment.reviewDueNotified.
  @Prop({ default: false })
  reviewDueNotified?: boolean;

  @Prop({ type: [PolicyVersionSchema], default: [] })
  versions: PolicyVersion[];

  @Prop({ type: [PolicyAuditEntrySchema], default: [] })
  auditLog: PolicyAuditEntry[];
}

export const PolicySchema = SchemaFactory.createForClass(Policy);
