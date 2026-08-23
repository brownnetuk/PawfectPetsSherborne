import { IsObject } from 'class-validator';

export class SubmitFormSubmissionDto {
  @IsObject()
  answers: Record<string, unknown>;
}
