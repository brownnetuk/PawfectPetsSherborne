import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateDayBookingDto } from './create-day-booking.dto';

// Moving a day/dog entry to a different animal isn't a supported edit --
// the calendar only ever lets staff change its product/quantity/date;
// swapping the animal would really mean deleting this one and adding a new
// one for the right dog.
export class UpdateDayBookingDto extends PartialType(OmitType(CreateDayBookingDto, ['animal'] as const)) {}
