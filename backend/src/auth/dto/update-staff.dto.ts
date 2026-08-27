import { IsMongoId, IsOptional, ValidateIf } from 'class-validator';

export class UpdateStaffDto {
  // Explicit null unassigns the role (full access); omitted means "leave
  // unchanged"; a string reassigns it. @ValidateIf so null is allowed through
  // despite @IsMongoId (which would otherwise reject it).
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsMongoId()
  role?: string | null;
}
