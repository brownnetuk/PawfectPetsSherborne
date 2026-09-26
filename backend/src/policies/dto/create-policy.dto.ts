import { IsArray, IsIn, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { REVIEW_FREQUENCIES } from '../schemas/policy.schema';

export class CreatePolicyDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsIn(REVIEW_FREQUENCIES)
  reviewFrequency?: string;

  @IsNotEmpty()
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  changeSummary?: string;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;

  // Which staff need to sign off this version -- omit to default to every
  // currently active (non-locked) staff member.
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  signOffStaffIds?: string[];
}
