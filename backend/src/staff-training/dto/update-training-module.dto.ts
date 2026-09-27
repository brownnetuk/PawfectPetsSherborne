import { PartialType } from '@nestjs/mapped-types';
import { CreateTrainingModuleDto } from './create-training-module.dto';

export class UpdateTrainingModuleDto extends PartialType(CreateTrainingModuleDto) {}
