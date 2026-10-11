import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @IsMongoId()
  invoice: string;

  @IsDateString()
  date: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  charges?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsMongoId()
  account: string;

  // Suppresses create()'s automatic "Thank You" email -- the staff app asks
  // the staff member first and sends it via POST /payments/:id/send-email
  // only if they confirm.
  @IsOptional()
  @IsBoolean()
  skipThankYouEmail?: boolean;
}
