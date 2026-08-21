import { Type } from 'class-transformer';
import { IsDateString, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
}
