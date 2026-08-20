import { PartialType } from '@nestjs/mapped-types';
import { CreateCrmActivityDto } from './create-crm-activity.dto';

export class UpdateCrmActivityDto extends PartialType(CreateCrmActivityDto) {}
