import { IsIn, IsOptional, IsString } from 'class-validator';

// "Amend dates" on the Booking Detail page -- recalculates the stay's
// DayBooking rows and the linked invoice's line items for the new dates,
// leaving whatever's already been paid untouched (see
// BoardingBookingsService.amendDates()).
export class AmendBoardingBookingDatesDto {
  @IsString()
  startDate: string;

  @IsString()
  dropOffTime: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsString()
  pickUpTime: string;

  @IsOptional()
  @IsIn(['AM', 'PM'])
  dropOffPeriod?: 'AM' | 'PM';

  @IsOptional()
  @IsIn(['AM', 'PM'])
  collectionPeriod?: 'AM' | 'PM';
}
