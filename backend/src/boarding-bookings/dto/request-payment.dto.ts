import { IsIn } from 'class-validator';

export class RequestPaymentDto {
  @IsIn(['deposit', 'full'])
  type: 'deposit' | 'full';
}
