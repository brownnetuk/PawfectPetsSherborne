import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// The receipt itself is read from the stored expense, not sent up again.
export class SendExpenseEmailDto {
  @IsEmail()
  to: string;

  @IsNotEmpty()
  @IsString()
  subject: string;

  @IsOptional()
  @IsString()
  message?: string;
}
