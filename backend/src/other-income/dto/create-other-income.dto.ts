import { Type } from 'class-transformer';
import {
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateOtherIncomeDto {
  @IsDateString()
  date: string;

  @IsNotEmpty()
  @IsString()
  receivedFrom: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsMongoId()
  account: string;

  // Set when this is a refund of an expense (the expense's Refund button).
  @IsOptional()
  @IsMongoId()
  expense?: string;
}
