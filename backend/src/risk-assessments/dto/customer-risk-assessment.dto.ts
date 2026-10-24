import { IsMongoId } from 'class-validator';

// Starting a customer risk assessment, or re-linking one to another customer.
export class CustomerRiskAssessmentCustomerDto {
  @IsMongoId()
  customer: string;
}
