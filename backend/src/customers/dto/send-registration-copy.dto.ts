import { IsNotEmpty, IsString } from 'class-validator';

// Base64 data: URI of the PDF the intake form just built client-side of the
// customer's own completed submission (same one CompletionSnapshot logs to
// the Activity tab) -- see CustomersService.sendRegistrationCopy.
export class SendRegistrationCopyDto {
  @IsNotEmpty()
  @IsString()
  attachmentData: string;

  @IsNotEmpty()
  @IsString()
  attachmentName: string;
}
