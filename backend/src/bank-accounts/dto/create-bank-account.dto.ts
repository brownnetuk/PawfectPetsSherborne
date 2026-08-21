import { IsNotEmpty, IsString } from 'class-validator';

export class CreateBankAccountDto {
  @IsNotEmpty()
  @IsString()
  name: string;
}
