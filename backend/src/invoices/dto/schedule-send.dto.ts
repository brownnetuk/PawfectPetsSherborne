import { IsDateString } from 'class-validator';

export class ScheduleSendDto {
  // ISO date-time the invoice should be emailed at.
  @IsDateString()
  sendAt: string;
}
