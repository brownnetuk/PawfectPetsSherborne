import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { BankAccountType } from '../schemas/bank-account.schema';

export class CreateBankAccountDto {
  @IsOptional()
  @IsEnum(BankAccountType)
  type?: BankAccountType;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  sortCode: string;

  @IsNotEmpty()
  @IsString()
  accountNumber: string;
}
