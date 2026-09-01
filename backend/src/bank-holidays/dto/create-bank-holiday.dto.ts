import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateBankHolidayDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsDateString()
  date: string;
}
