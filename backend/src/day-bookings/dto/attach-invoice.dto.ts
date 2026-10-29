import { ArrayNotEmpty, IsArray, IsMongoId } from 'class-validator';

// Links freshly rebooked rows to the invoice the edited booking was on --
// see DayBookingsService.attachToInvoice().
export class AttachInvoiceDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  bookingIds: string[];

  @IsMongoId()
  invoice: string;
}
