import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Minimal record staff create ahead of sending the customer their intake-form link.
// The public form fetches this by id to pre-fill screen 1, then completes it via
// PATCH /customers/:id with the full CreateCustomerDto payload. firstName/surname
// (not a single `name`) to match CreateCustomerDto's own split -- CustomersService
// computes `name` from these the same way it does everywhere else.
export class CreateLeadDto {
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  surname?: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;
}
