import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { REVIEW_FREQUENCIES } from '../schemas/risk-assessment.schema';
import { CreateRiskItemDto } from './create-risk-item.dto';

// Step 1 of "Import from Word": the uploaded .docx, read into a draft for
// staff to check (RiskAssessmentsService.previewImport()) -- nothing is saved.
export class PreviewRiskAssessmentImportDto {
  // base64 data URI, same as the terms-and-conditions upload.
  @IsNotEmpty()
  @IsString()
  file: string;

  @IsOptional()
  @IsString()
  fileName?: string;
}

// Step 2: the (possibly edited) draft, saved as a new draft assessment with
// all of its risks in one go.
export class ImportRiskAssessmentDto {
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
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  assessmentDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  nextReviewDate?: string;

  @IsOptional()
  @IsString()
  assessedBy?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRiskItemDto)
  risks: CreateRiskItemDto[];
}
