import { IsNotEmpty, IsString } from 'class-validator';

export class CreateInvoiceTermDto {
  @IsNotEmpty()
  @IsString()
  text: string;
}
