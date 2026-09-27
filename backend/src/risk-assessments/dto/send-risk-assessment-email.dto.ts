import { IsEmail } from 'class-validator';

export class SendRiskAssessmentEmailDto {
  @IsEmail()
  email: string;
}
