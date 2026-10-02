import { IsNotEmpty, IsString } from 'class-validator';

// Base64 data: URI of the confirmation PDF the admin just built client-side
// -- same pattern as SendPaymentReceiptDto.
export class SendBookingConfirmationDto {
  @IsNotEmpty()
  @IsString()
  attachmentData: string;

  @IsNotEmpty()
  @IsString()
  attachmentName: string;
}
