import { IsEnum } from 'class-validator';
import { CustomerStatus } from '../schemas/customer.schema';

export class UpdateCustomerStatusDto {
  @IsEnum(CustomerStatus)
  status: CustomerStatus;
}
