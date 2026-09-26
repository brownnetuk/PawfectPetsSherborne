import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { REVIEW_FREQUENCIES, RISK_ASSESSMENT_STATUSES } from '../schemas/risk-assessment.schema';

export class CreateRiskAssessmentDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  regulationReference?: string;

  @IsOptional()
  @IsIn(REVIEW_FREQUENCIES)
  reviewFrequency?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsIn(RISK_ASSESSMENT_STATUSES)
  status?: string;
}
