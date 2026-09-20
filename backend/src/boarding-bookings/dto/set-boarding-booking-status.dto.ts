import { IsIn, IsOptional } from 'class-validator';
import { BOOKING_STATUS_LABELS } from '../schemas/boarding-booking.schema';

export class SetBoardingBookingStatusDto {
  // null/omitted clears the manual override, going back to automatic.
  @IsOptional()
  @IsIn(BOOKING_STATUS_LABELS)
  status?: (typeof BOOKING_STATUS_LABELS)[number] | null;
}
