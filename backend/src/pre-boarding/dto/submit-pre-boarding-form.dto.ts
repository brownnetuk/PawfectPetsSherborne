import { IsArray, IsString } from 'class-validator';

export class SubmitPreBoardingFormDto {
  // One name per dog, typed by the owner on the form.
  @IsArray()
  @IsString({ each: true })
  dogNames: string[];

  // One { [questionId]: { value, details } } record per dog, same order as
  // dogNames -- validated properly in PreBoardingService.submit().
  @IsArray()
  answers: Record<string, unknown>[];
}
