import { IsEmail, IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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

  // Optional: when given, the email gets a tracking pixel embedded (see
  // SettingsService.sendTriggeredEmail) and its "sent"/"read" pair shows up
  // in this customer's Activity feed. Omitted by flows with no real
  // customer yet to attach an Activity entry to.
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  // trigger: 'form' only -- the specific form's name (e.g. "Medication
  // Authentication"), so the Activity entry reads "<name> form email
  // sent"/"read" instead of the generic "Form email sent"/"read" that gives
  // no clue which of possibly several forms was actually sent.
  @IsOptional()
  @IsString()
  formName?: string;
}
