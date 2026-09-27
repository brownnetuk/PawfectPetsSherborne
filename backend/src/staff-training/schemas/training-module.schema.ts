import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Staff } from '../../staff/schemas/staff.schema';

// Same interval set as Policy.reviewFrequency / RiskAssessment.reviewFrequency --
// duplicated rather than imported, same "otherwise unrelated modules" convention
// those two already use between each other.
export const REVIEW_FREQUENCIES = ['weekly', 'monthly', 'quarterly', '6-monthly', 'annually'] as const;
export type ReviewFrequency = (typeof REVIEW_FREQUENCIES)[number];

export const TRAINING_MODULE_STATUSES = ['draft', 'review', 'live'] as const;
export type TrainingModuleStatus = (typeof TRAINING_MODULE_STATUSES)[number];

export const CONTENT_BLOCK_TYPES = ['video', 'reading', 'pdf'] as const;
export type ContentBlockType = (typeof CONTENT_BLOCK_TYPES)[number];

// Kept with its own _id (Mongoose's default for a subdocument schema) since
// blocks are individually reordered/edited/removed, and the PDF variant is
// streamed back by its own id (GET .../content/:blockId/file).
@Schema()
export class TrainingContentBlock {
  _id: Types.ObjectId;

  @Prop({ required: true })
  order: number;

  @Prop({ type: String, enum: CONTENT_BLOCK_TYPES, required: true })
  type: ContentBlockType;

  @Prop()
  title?: string;

  @Prop()
  videoUrl?: string;

  // Rich HTML, same convention as PolicyVersion.content.
  @Prop()
  readingText?: string;

  // Base64 data URI -- same storage approach as BusinessInfo.logoImage/
  // termsDocx. This codebase has no S3/blob storage; everything uploaded
  // lives in Mongo as a data URI, streamed back by regex-parsing the
  // `data:<mime>;base64,<data>` prefix (see TrainingModulesService.getContentFile()).
  @Prop()
  pdfFile?: string;

  @Prop()
  pdfFileName?: string;
}
export const TrainingContentBlockSchema = SchemaFactory.createForClass(TrainingContentBlock);

// One bank question. Kept with its own _id (like RiskItem) since questions
// are individually added/edited/removed, and an attempt snapshot references
// "which bank question was this" by id.
//
// correctIndex must NEVER reach a non-training.manage caller, or a
// /training/my/* response before grading -- stripped explicitly wherever
// this is serialized for either audience (see TrainingModulesService/
// TrainingAttemptsService), not enforced at the schema level, since the
// editor legitimately needs to read and write it.
@Schema()
export class TrainingQuestion {
  _id: Types.ObjectId;

  @Prop({ required: true })
  text: string;

  @Prop({ type: [String], required: true })
  options: string[];

  @Prop({ required: true })
  correctIndex: number;
}
export const TrainingQuestionSchema = SchemaFactory.createForClass(TrainingQuestion);

// A lightweight, cached compliance status per assigned staff member --
// mirrors PolicyVersion.signOffs[]. Full attempt history lives in the
// separate TrainingAttempt collection; this only ever needs to answer "is
// this person compliant right now", cheaply, for the audit view and the cron.
@Schema({ _id: false })
export class TrainingAssignment {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Staff.name, required: true })
  staff: Types.ObjectId;

  @Prop({ required: true })
  staffName: string;

  @Prop({ required: true, default: Date.now })
  assignedAt: Date;

  // 'YYYY-MM-DD' -- the first deadline, assignedAt + dueWithinDays.
  @Prop({ required: true })
  dueDate: string;

  @Prop()
  lastAttemptAt?: Date;

  @Prop()
  lastScorePercent?: number;

  @Prop()
  lastPassed?: boolean;

  // 'YYYY-MM-DD' -- date of the most recent submitted attempt, pass or fail.
  @Prop()
  lastCompletedAt?: string;

  // 'YYYY-MM-DD' -- the recurring compliance date. Only ever advanced on a
  // PASS (see TrainingAttemptsService.submitAttempt) -- a fail leaves this
  // (or the original dueDate, if never passed) untouched, so the person
  // stays due/overdue until they pass.
  @Prop()
  nextDueDate?: string;

  // Guards the hourly cron's "Training review due" notification the same
  // way RiskAssessment.reviewDueNotified guards its own -- cleared whenever
  // nextDueDate advances.
  @Prop({ default: false })
  reviewDueNotified?: boolean;
}
export const TrainingAssignmentSchema = SchemaFactory.createForClass(TrainingAssignment);

@Schema({ _id: false })
export class TrainingAuditEntry {
  @Prop({ required: true })
  action: string;

  @Prop()
  changes?: string;

  @Prop({ required: true })
  actor: string;

  @Prop({ required: true, default: Date.now })
  at: Date;
}
export const TrainingAuditEntrySchema = SchemaFactory.createForClass(TrainingAuditEntry);

@Schema({ timestamps: true })
export class TrainingModule extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: TRAINING_MODULE_STATUSES, default: 'draft' })
  status: TrainingModuleStatus;

  @Prop({ type: [TrainingContentBlockSchema], default: [] })
  contentBlocks: TrainingContentBlock[];

  @Prop({ type: [TrainingQuestionSchema], default: [] })
  questionBank: TrainingQuestion[];

  @Prop({ required: true, default: 80 })
  passMarkPercent: number;

  @Prop({ required: true, default: 5 })
  questionsPerAttempt: number;

  @Prop({ type: String, enum: REVIEW_FREQUENCIES })
  reviewFrequency?: ReviewFrequency;

  @Prop({ required: true, default: 14 })
  dueWithinDays: number;

  // When true, the hourly cron adds a fresh assignment row for any active
  // staff member not already present -- including staff created after this
  // was turned on. Turning it off does NOT remove existing rows, same
  // non-destructive spirit as assignUsers() only ever dropping someone
  // explicitly deselected.
  @Prop({ default: false })
  assignAllStaff: boolean;

  @Prop({ type: [TrainingAssignmentSchema], default: [] })
  assignments: TrainingAssignment[];

  @Prop({ type: [TrainingAuditEntrySchema], default: [] })
  auditLog: TrainingAuditEntry[];
}

export const TrainingModuleSchema = SchemaFactory.createForClass(TrainingModule);
