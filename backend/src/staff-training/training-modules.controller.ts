import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { AssignTrainingUsersDto } from './dto/assign-training-users.dto';
import { CreateTrainingModuleDto } from './dto/create-training-module.dto';
import { SetAssignAllDto } from './dto/set-assign-all.dto';
import { UpdateTrainingModuleDto } from './dto/update-training-module.dto';
import { TrainingModulesService } from './training-modules.service';

@Controller('training/modules')
export class TrainingModulesController {
  constructor(private readonly trainingModulesService: TrainingModulesService) {}

  @RequirePermission('training.manage')
  @Get()
  findAll() {
    return this.trainingModulesService.findAll();
  }

  // Declared before ':id' so "staff"/"compliance" aren't swallowed as an id.
  @RequirePermission('training.manage')
  @Get('staff')
  listStaffOptions() {
    return this.trainingModulesService.listStaffOptions();
  }

  @RequirePermission('training.manage')
  @Get('compliance')
  getCompliance() {
    return this.trainingModulesService.getCompliance();
  }

  @RequirePermission('training.manage')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.trainingModulesService.findOne(id);
  }

  @RequirePermission('training.manage')
  @Post()
  create(@Body() dto: CreateTrainingModuleDto, @CurrentUser() user: CurrentUserShape) {
    return this.trainingModulesService.create(dto, user.name);
  }

  @RequirePermission('training.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTrainingModuleDto, @CurrentUser() user: CurrentUserShape) {
    return this.trainingModulesService.update(id, dto, user.name);
  }

  @RequirePermission('training.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.trainingModulesService.remove(id);
  }

  @RequirePermission('training.manage')
  @Patch(':id/assign-users')
  assignUsers(@Param('id') id: string, @Body() dto: AssignTrainingUsersDto, @CurrentUser() user: CurrentUserShape) {
    return this.trainingModulesService.assignUsers(id, dto, user.name);
  }

  @RequirePermission('training.manage')
  @Patch(':id/assign-all')
  setAssignAllStaff(@Param('id') id: string, @Body() dto: SetAssignAllDto, @CurrentUser() user: CurrentUserShape) {
    return this.trainingModulesService.setAssignAllStaff(id, dto.enabled, user.name);
  }

  @RequirePermission('training.manage')
  @Get(':id/attempts')
  getAttemptHistory(@Param('id') id: string, @Query('staffId') staffId?: string) {
    return this.trainingModulesService.getAttemptHistory(id, staffId);
  }

  // Ungated -- shared by the Training Admin preview and the My Training
  // viewer; a PDF block's bytes aren't compliance-sensitive on their own.
  @Get(':id/content/:blockId/file')
  async getContentFile(
    @Param('id') id: string,
    @Param('blockId') blockId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, contentType, fileName } = await this.trainingModulesService.getContentFile(id, blockId);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${fileName}"`,
    });
    return new StreamableFile(buffer);
  }
}
