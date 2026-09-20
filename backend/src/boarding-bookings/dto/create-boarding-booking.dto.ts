import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';

// Direct (no-quote) booking creation -- staff's "+ New booking" on the
// Bookings tab. Dates are plain 'YYYY-MM-DD' strings, same convention as
// QuoteDayCarePlan/QuoteBoardingPlan (../../quotes/schemas/quote.schema.ts).
export class CreateBoardingBookingDto {
  @IsMongoId()
  customer: string;

  @IsArray()
  @IsMongoId({ each: true })
  @ArrayMinSize(1)
  animals: string[];

  @IsIn(['boarding', 'dayCare'])
  type: 'boarding' | 'dayCare';

  @IsString()
  startDate: string;

  @IsString()
  dropOffTime: string;

  // Boarding only -- day care is always a single day (startDate).
  @IsOptional()
  @IsString()
  endDate?: string;

  @IsString()
  pickUpTime: string;

  // Day care only -- decides half-day vs full-day pricing (see
  // DayBookingsService.dayCareProductFor()).
  @IsOptional()
  @IsIn(['AM', 'PM'])
  dropOffPeriod?: 'AM' | 'PM';

  @IsOptional()
  @IsIn(['AM', 'PM'])
  collectionPeriod?: 'AM' | 'PM';

  @IsOptional()
  @IsString()
  notes?: string;
}
