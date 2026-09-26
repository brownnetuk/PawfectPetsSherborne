import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { RESIDUAL_RISK_LEVELS, REVIEW_FREQUENCIES } from '../schemas/risk-assessment.schema';

export class CreateRiskItemDto {
  @IsNotEmpty()
  @IsString()
  hazard: string;

  @IsOptional()
  @IsString()
  whoAtRisk?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  existingControls?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  furtherActions?: string[];

  @IsInt()
  @Min(1)
  @Max(5)
  likelihood: number;

  @IsInt()
  @Min(1)
  @Max(5)
  severity: number;

  @IsIn(RESIDUAL_RISK_LEVELS)
  residualRisk: string;

  @IsOptional()
  @IsIn(REVIEW_FREQUENCIES)
  reviewPeriod?: string;
}
