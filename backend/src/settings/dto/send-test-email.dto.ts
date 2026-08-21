import { IsEmail } from 'class-validator';

export class SendTestEmailDto {
  @IsEmail()
  to: string;
}
