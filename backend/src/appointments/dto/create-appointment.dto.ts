import { IsDateString, IsMongoId, IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateAppointmentDto {
  @IsMongoId()
  customer: string;

  @IsNotEmpty()
  @IsString()
  reason: string;

  @IsDateString()
  date: string;

  // 24-hour 'HH:mm', matching a native <input type="time">'s value format.
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time must be in HH:mm format' })
  time: string;
}
