import { IsArray, IsInt, IsOptional, Min } from 'class-validator';

export class UpdatePreBoardingSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  maxScore?: number;

  // Shallow-validated here; PreBoardingService.updateSettings() normalises
  // each entry into a PreBoardingQuestion.
  @IsOptional()
  @IsArray()
  questions?: Record<string, unknown>[];
}
