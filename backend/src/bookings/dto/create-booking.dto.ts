import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ServiceType } from '../schemas/booking.schema';

export class CreateBookingDto {
  @IsMongoId()
  customer: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  animals: string[];

  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;
}
