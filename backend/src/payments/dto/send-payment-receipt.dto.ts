import { IsNotEmpty, IsString } from 'class-validator';

// Base64 data: URI of the receipt PDF the admin just built client-side of
// this payment -- see CustomersService.sendRegistrationCopy for the same
// pattern.
export class SendPaymentReceiptDto {
  @IsNotEmpty()
  @IsString()
  attachmentData: string;

  @IsNotEmpty()
  @IsString()
  attachmentName: string;
}
