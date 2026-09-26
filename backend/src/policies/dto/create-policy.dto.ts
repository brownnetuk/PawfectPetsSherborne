import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { REVIEW_FREQUENCIES } from '../schemas/policy.schema';

export class CreatePolicyDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;

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
}
