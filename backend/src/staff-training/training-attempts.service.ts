import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { TrainingModule } from './schemas/training-module.schema';
import { AttemptQuestionSnapshot, TrainingAttempt } from './schemas/training-attempt.schema';
import { TrainingModulesService } from './training-modules.service';

// Picks `n` random, non-repeating items from `bank` via Fisher-Yates --
// no existing "pick N of M" precedent anywhere in this codebase to mirror,
// this is fresh.
function pickRandomQuestions<T>(bank: T[], n: number): T[] {
  const idx = bank.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.min(n, bank.length)).map((i) => bank[i]);
}

export interface StartAttemptResult {
  attemptId: string;
  passMarkPercent: number;
  questions: Array<{ questionId: string; text: string; options: string[] }>;
}

export interface SubmitAttemptResult {
  scorePercent: number;
  passed: boolean;
  passMarkPercent: number;
  review: Array<{ text: string; options: string[]; correctIndex: number; selectedIndex: number }>;
}

@Injectable()
export class TrainingAttemptsService {
  constructor(
    @InjectModel(TrainingModule.name) private readonly moduleModel: Model<TrainingModule>,
    @InjectModel(TrainingAttempt.name) private readonly attemptModel: Model<TrainingAttempt>,
    private readonly trainingModulesService: TrainingModulesService,
  ) {}

  async startAttempt(moduleId: string, staffId: string, staffName: string): Promise<StartAttemptResult> {
    const module = await this.moduleModel.findOne({ _id: moduleId, status: 'live' }).exec();
    const isAssigned = module?.assignments.some((a) => String(a.staff) === staffId);
    if (!module || !isAssigned) {
      throw new NotFoundException('This training module is not assigned to you.');
    }
    if (module.questionBank.length === 0) {
      throw new BadRequestException('This module has no questions to attempt yet.');
    }

    const picked = pickRandomQuestions(module.questionBank, module.questionsPerAttempt);
    const questionsAsked: AttemptQuestionSnapshot[] = picked.map((q) => ({
      questionId: q._id,
      text: q.text,
      options: q.options,
      correctIndex: q.correctIndex,
    })) as AttemptQuestionSnapshot[];

    const attempt = await this.attemptModel.create({
      module: module._id,
      moduleName: module.name,
      staff: staffId,
      staffName,
      status: 'in-progress',
      passMarkPercent: module.passMarkPercent,
      questionsAsked,
    });

    // Never return correctIndex here -- this is the one place answers must
    // not leak, enforced by only mapping out the safe fields.
    return {
      attemptId: String(attempt._id),
      passMarkPercent: attempt.passMarkPercent,
      questions: questionsAsked.map((q) => ({ questionId: String(q.questionId), text: q.text, options: q.options })),
    };
  }

  async submitAttempt(attemptId: string, staffId: string, dto: SubmitAttemptDto): Promise<SubmitAttemptResult> {
    const attempt = await this.attemptModel.findById(attemptId).exec();
    if (!attempt || String(attempt.staff) !== staffId) {
      throw new NotFoundException('Attempt not found.');
    }
    if (attempt.status !== 'in-progress') {
      throw new ForbiddenException('This attempt has already been submitted.');
    }
    if (dto.answers.length !== attempt.questionsAsked.length) {
      throw new BadRequestException(`Expected ${attempt.questionsAsked.length} answers, got ${dto.answers.length}.`);
    }

    // Grades purely from this attempt's own snapshot -- never re-reads the
    // live question bank, so it can't be fooled by the bank changing (or a
    // question being deleted) mid-attempt.
    const correctCount = attempt.questionsAsked.filter((q, i) => q.correctIndex === dto.answers[i]).length;
    const scorePercent = Math.round((100 * correctCount) / attempt.questionsAsked.length);
    const passed = scorePercent >= attempt.passMarkPercent;

    attempt.answers = dto.answers;
    attempt.scorePercent = scorePercent;
    attempt.passed = passed;
    attempt.status = 'submitted';
    attempt.submittedAt = new Date();
    await attempt.save();

    await this.trainingModulesService.recordAttemptResult(String(attempt.module), staffId, scorePercent, passed);

    return {
      scorePercent,
      passed,
      passMarkPercent: attempt.passMarkPercent,
      // Safe to reveal correctIndex now that grading has happened.
      review: attempt.questionsAsked.map((q, i) => ({
        text: q.text,
        options: q.options,
        correctIndex: q.correctIndex,
        selectedIndex: dto.answers[i],
      })),
    };
  }
}
