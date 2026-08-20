import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateAnimalDto } from './create-animal.dto';

// Same shape as UpdateAnimalDto, minus `customer` -- the public, customer-scoped
// update route asserts ownership by comparing the URL's :customerId against the
// animal's existing record (see AnimalsService.updateForCustomer), so letting a
// caller resubmit `customer` here would let them reassign someone else's pet to
// themselves regardless of that check.
export class PublicUpdateAnimalDto extends PartialType(OmitType(CreateAnimalDto, ['customer'] as const)) {}
