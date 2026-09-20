import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsMongoId, IsOptional, Min } from 'class-validator';

export class UpdateBoardingWorkflowSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  preCheckInDaysBefore?: number;

  @IsOptional()
  @IsMongoId()
  preCheckInFormBoarding?: string;

  @IsOptional()
  @IsMongoId()
  preCheckInFormDayCare?: string;

  @IsOptional()
  @IsMongoId()
  checkInFormBoarding?: string;

  @IsOptional()
  @IsMongoId()
  checkInFormDayCare?: string;

  @IsOptional()
  @IsBoolean()
  checkInRequirePhoto?: boolean;

  @IsOptional()
  @IsBoolean()
  checkInRequireSignature?: boolean;

  @IsOptional()
  @IsMongoId()
  checkOutFormBoarding?: string;

  @IsOptional()
  @IsMongoId()
  checkOutFormDayCare?: string;

  @IsOptional()
  @IsBoolean()
  checkOutRequireSignature?: boolean;
}
