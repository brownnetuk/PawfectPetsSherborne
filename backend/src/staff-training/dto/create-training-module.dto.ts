import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { REVIEW_FREQUENCIES, TRAINING_MODULE_STATUSES } from '../schemas/training-module.schema';
import { ContentBlockDto } from './content-block.dto';
import { QuestionDto } from './question.dto';

export class CreateTrainingModuleDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(TRAINING_MODULE_STATUSES)
  status?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContentBlockDto)
  contentBlocks?: ContentBlockDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questionBank?: QuestionDto[];

  @IsOptional()
  @IsNumber()
  passMarkPercent?: number;

  @IsOptional()
  @IsNumber()
  questionsPerAttempt?: number;

  @IsOptional()
  @IsIn(REVIEW_FREQUENCIES)
  reviewFrequency?: string;

  @IsOptional()
  @IsNumber()
  dueWithinDays?: number;
}
