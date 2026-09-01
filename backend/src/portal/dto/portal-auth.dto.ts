import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

// Staff toggle for a customer's portal access (PortalAdminController).
export class SetPortalActiveDto {
  @IsBoolean()
  active: boolean;
}

export class RequestCodeDto {
  @IsEmail()
  email: string;
}

export class VerifyCodeDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;
}

export class SetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class RegisterPushDto {
  @IsString()
  token: string;

  @IsOptional()
  @IsString()
  platform?: string;
}

// The customer-editable contact fields on "Customer Details". Email is
// deliberately excluded — it's the login identity and changing it here would
// silently orphan the account.
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  surname?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  address1?: string;

  @IsOptional()
  @IsString()
  address2?: string;

  @IsOptional()
  @IsString()
  town?: string;

  @IsOptional()
  @IsString()
  county?: string;

  @IsOptional()
  @IsString()
  postcode?: string;
}
