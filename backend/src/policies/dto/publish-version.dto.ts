import { IsArray, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PublishVersionDto {
  @IsNotEmpty()
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  changeSummary?: string;

  // Which staff need to sign off this new version -- omit to default to
  // every currently active (non-locked) staff member.
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  signOffStaffIds?: string[];
}
