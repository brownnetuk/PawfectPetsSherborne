import { IsIn, IsOptional, IsString } from 'class-validator';
import { REVIEW_FREQUENCIES } from '../schemas/policy.schema';

// Metadata only -- content is versioned separately via PublishVersionDto
// (POST :id/versions), never edited in place on an existing version.
export class UpdatePolicyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsIn(REVIEW_FREQUENCIES)
  reviewFrequency?: string;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: string;
}
