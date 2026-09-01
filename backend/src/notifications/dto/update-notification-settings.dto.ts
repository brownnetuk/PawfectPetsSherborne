import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  customerActivated?: boolean;

  @IsOptional()
  @IsBoolean()
  appointmentReminders?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  appointmentLeadMinutes?: number;

  @IsOptional()
  @IsBoolean()
  dailyDigest?: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'dailyDigestTime must be HH:mm' })
  dailyDigestTime?: string;

  @IsOptional()
  @IsBoolean()
  invoicesOverdue?: boolean;

  @IsOptional()
  @IsBoolean()
  invoicesRead?: boolean;
}
