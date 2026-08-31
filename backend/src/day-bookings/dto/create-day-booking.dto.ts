import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsMongoId, IsOptional, Min } from 'class-validator';

export class CreateDayBookingDto {
  @IsMongoId()
  animal: string;

  @IsDateString()
  date: string;

  @IsMongoId()
  product: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;
}
