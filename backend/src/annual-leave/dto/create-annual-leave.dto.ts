import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateAnnualLeaveDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;
}
