import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  @IsString()
  username: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  // When set, issue a longer-lived token so staff stay signed in for weeks
  // rather than the default 12 hours.
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
