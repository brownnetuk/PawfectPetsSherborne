import { IsOptional, IsString } from 'class-validator';

// All plain @IsString() (no @IsEmail() on `email`) so every field, including
// email, can genuinely be cleared by saving it blank -- unlike
// UpdateEmailSettingsDto's fromAddress, there's no format validation here to
// fight with an intentionally-empty string.
export class UpdateBusinessInfoDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  town?: string;

  @IsOptional()
  @IsString()
  postcode?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  logoImage?: string;
}
