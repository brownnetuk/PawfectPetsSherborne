import { PartialType } from '@nestjs/mapped-types';
import { CreateEmailGroupDto } from './create-email-group.dto';

export class UpdateEmailGroupDto extends PartialType(CreateEmailGroupDto) {}
