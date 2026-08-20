import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// Minimal record staff create ahead of sending the customer their intake-form link.
// The public form fetches this by id to pre-fill screen 1, then completes it via
// PATCH /customers/:id with the full CreateCustomerDto payload.
export class CreateLeadDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;
}
