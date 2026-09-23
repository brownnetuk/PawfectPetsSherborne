import { IsBoolean } from 'class-validator';

export class SetBoardingBookingArchivedDto {
  @IsBoolean()
  archived: boolean;
}
