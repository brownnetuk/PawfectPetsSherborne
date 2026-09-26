import { PartialType } from '@nestjs/mapped-types';
import { CreateRiskItemDto } from './create-risk-item.dto';

export class UpdateRiskItemDto extends PartialType(CreateRiskItemDto) {}
