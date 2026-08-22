import { Type } from 'class-transformer';
import { IsDateString, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCreditNoteDto {
  @IsMongoId()
  customer: string;

  @IsOptional()
  @IsMongoId()
  invoice?: string;

  @IsDateString()
  date: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @IsNotEmpty()
  @IsString()
  reason: string;

  @IsOptional()
  @IsMongoId()
  account?: string;
}
