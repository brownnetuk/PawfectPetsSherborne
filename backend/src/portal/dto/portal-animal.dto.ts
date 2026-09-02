import { OmitType } from '@nestjs/mapped-types';
import { CreateAnimalDto } from '../../animals/dto/create-animal.dto';

// The customer never supplies `customer` — PortalService forces it to the
// authenticated customer before creating. Everything else matches the full
// create DTO (so required fields stay required).
export class PortalCreateAnimalDto extends OmitType(CreateAnimalDto, ['customer'] as const) {}
