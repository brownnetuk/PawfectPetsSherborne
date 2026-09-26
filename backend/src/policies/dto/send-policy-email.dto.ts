import { IsEmail } from 'class-validator';

export class SendPolicyEmailDto {
  @IsEmail()
  email: string;
}
