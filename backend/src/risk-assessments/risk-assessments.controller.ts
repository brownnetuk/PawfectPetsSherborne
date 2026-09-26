import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateRiskAssessmentDto } from './dto/create-risk-assessment.dto';
import { CreateRiskItemDto } from './dto/create-risk-item.dto';
import { UpdateRiskAssessmentDto } from './dto/update-risk-assessment.dto';
import { UpdateRiskItemDto } from './dto/update-risk-item.dto';
import { RiskAssessmentsService } from './risk-assessments.service';

@Controller('risk-assessments')
export class RiskAssessmentsController {
  constructor(private readonly riskAssessmentsService: RiskAssessmentsService) {}

  @Get()
  findAll() {
    return this.riskAssessmentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.riskAssessmentsService.findOne(id);
  }

  @RequirePermission('bookings.manage')
  @Post()
  create(@Body() dto: CreateRiskAssessmentDto, @CurrentUser() user: CurrentUserShape) {
    return this.riskAssessmentsService.create(dto, user.name);
  }

  @RequirePermission('bookings.manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRiskAssessmentDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.riskAssessmentsService.update(id, dto, user.name);
  }

  @RequirePermission('bookings.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.riskAssessmentsService.remove(id);
  }

  @RequirePermission('bookings.manage')
  @Post(':id/review')
  reviewPolicy(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.riskAssessmentsService.reviewPolicy(id, user.name);
  }

  @RequirePermission('bookings.manage')
  @Post(':id/risks')
  addRisk(
    @Param('id') id: string,
    @Body() dto: CreateRiskItemDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.riskAssessmentsService.addRisk(id, dto, user.name);
  }

  @RequirePermission('bookings.manage')
  @Patch(':id/risks/:riskId')
  updateRisk(
    @Param('id') id: string,
    @Param('riskId') riskId: string,
    @Body() dto: UpdateRiskItemDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.riskAssessmentsService.updateRisk(id, riskId, dto, user.name);
  }

  @RequirePermission('bookings.manage')
  @Delete(':id/risks/:riskId')
  removeRisk(
    @Param('id') id: string,
    @Param('riskId') riskId: string,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.riskAssessmentsService.removeRisk(id, riskId, user.name);
  }
}
