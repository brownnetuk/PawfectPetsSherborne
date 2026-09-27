import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Staff } from '../../staff/schemas/staff.schema';
import { TrainingModule } from './training-module.schema';

export const ATTEMPT_STATUSES = ['in-progress', 'submitted'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

// A full snapshot of one bank question, taken at start-of-attempt -- grading
// reads only this, never the live question bank, so it can't be fooled by
// the bank changing mid-attempt and stays accurate even if a question is
// later edited or deleted from the module.
@Schema({ _id: false })
export class AttemptQuestionSnapshot {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  questionId: Types.ObjectId;

  @Prop({ required: true })
  text: string;

  @Prop({ type: [String], required: true })
  options: string[];

  // Stripped from the /start response before it reaches the client -- see
  // TrainingAttemptsService.startAttempt(). Read back only at submit time.
  @Prop({ required: true })
  correctIndex: number;
}
export const AttemptQuestionSnapshotSchema = SchemaFactory.createForClass(AttemptQuestionSnapshot);

// One row per quiz attempt -- the append-only event log behind
// TrainingModule.assignments[]'s cached "latest status" view. Never edited
// after submission; cascade-deleted when its module is removed (see
// TrainingModulesService.remove()).
@Schema({ timestamps: true })
export class TrainingAttempt extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: TrainingModule.name, required: true })
  module: Types.ObjectId;

  // Snapshot, same reasoning as PolicyVersion capturing content at publish
  // time -- survives the parent module being renamed or deleted later.
  @Prop({ required: true })
  moduleName: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Staff.name, required: true })
  staff: Types.ObjectId;

  @Prop({ required: true })
  staffName: string;

  @Prop({ type: String, enum: ATTEMPT_STATUSES, default: 'in-progress' })
  status: AttemptStatus;

  // Snapshot -- the module's pass mark could change before this attempt is
  // submitted; grading must use the value that applied when the attempt started.
  @Prop({ required: true })
  passMarkPercent: number;

  @Prop({ type: [AttemptQuestionSnapshotSchema], required: true })
  questionsAsked: AttemptQuestionSnapshot[];

  // Selected option index per question, in questionsAsked order.
  @Prop({ type: [Number] })
  answers?: number[];

  @Prop()
  scorePercent?: number;

  @Prop()
  passed?: boolean;

  @Prop({ required: true, default: Date.now })
  startedAt: Date;

  @Prop()
  submittedAt?: Date;
}

export const TrainingAttemptSchema = SchemaFactory.createForClass(TrainingAttempt);
