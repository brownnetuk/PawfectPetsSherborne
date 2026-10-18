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
}
