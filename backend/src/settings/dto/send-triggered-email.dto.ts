import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { EmailTrigger } from '../schemas/email-template.schema';

export class SendTriggeredEmailDto {
  @IsEnum(EmailTrigger)
  trigger: EmailTrigger;

  @IsEmail()
  to: string;

  // The customer's name and the link to send -- both already known to the
  // admin frontend at the point it offers "Send email" alongside "Copy
  // link", so there's no need for this module to re-fetch the customer or
  // know how the intake app builds its URLs.
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  link: string;
}
