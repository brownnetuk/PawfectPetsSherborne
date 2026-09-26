import { PartialType } from '@nestjs/mapped-types';
import { CreateRiskAssessmentDto } from './create-risk-assessment.dto';

export class UpdateRiskAssessmentDto extends PartialType(CreateRiskAssessmentDto) {}
