import { IsDateString, IsNumber } from 'class-validator';

export class SetOpeningBalanceDto {
  @IsDateString()
  date: string;

  // No @Min(0) -- an account can genuinely be overdrawn as of the
  // reconciliation date.
  @IsNumber()
  balance: number;
}
