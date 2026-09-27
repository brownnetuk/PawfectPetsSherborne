import { IsArray, IsInt } from 'class-validator';

export class SubmitAttemptDto {
  // Selected option index per question, in the same order the /start
  // response returned questionsAsked.
  @IsArray()
  @IsInt({ each: true })
  answers: number[];
}
