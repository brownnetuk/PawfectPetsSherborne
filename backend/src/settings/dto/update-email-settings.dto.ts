import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateEmailSettingsDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  // Plain text in the request; the service encrypts it before persisting.
  // Omitted (not just empty), the existing stored secret is left untouched --
  // staff never see it again once saved, so there's nothing to "leave as is"
  // by resubmitting a value they were never given back.
  @IsOptional()
  @IsString()
  clientSecret?: string;

  @IsOptional()
  @IsEmail()
  fromAddress?: string;

  @IsOptional()
  @IsString()
  fromName?: string;
}
