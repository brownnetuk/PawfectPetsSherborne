import { Type } from 'class-transformer';
import { IsDateString, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateBankTransferDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsMongoId()
  fromAccount: string;

  @IsMongoId()
  toAccount: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;
}
