import { IsBoolean, IsEmail, IsMongoId, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export class RegisterDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  username: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsOptional()
  @IsBoolean()
  isBreakGlass?: boolean;

  // Left unassigned (the default) means full access -- see PermissionsGuard.
  @IsOptional()
  @IsMongoId()
  role?: string;
}
