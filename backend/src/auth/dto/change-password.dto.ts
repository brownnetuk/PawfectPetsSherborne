import { MinLength } from 'class-validator';

export class ChangePasswordDto {
  @MinLength(8)
  password: string;
}
