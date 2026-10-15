import { IsArray } from 'class-validator';

export class SubmitPreBoardingFormDto {
  // One { [questionId]: { value, details } } record per dog, same order as
  // the form's dogNames -- validated properly in PreBoardingService.submit().
  @IsArray()
  answers: Record<string, unknown>[];
}
