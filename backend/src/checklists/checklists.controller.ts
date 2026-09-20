import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ChecklistsService } from './checklists.service';
import { AssignChecklistDto } from './dto/assign-checklist.dto';
import { CreateChecklistTemplateDto } from './dto/create-checklist-template.dto';
import { UpdateChecklistAssignmentDto } from './dto/update-checklist-assignment.dto';
import { UpdateChecklistTemplateDto } from './dto/update-checklist-template.dto';

@Controller('checklist-templates')
export class ChecklistTemplatesController {
  constructor(private readonly checklists: ChecklistsService) {}

  // Not gated: any staff member assigning a checklist to a day needs to see
  // the list of templates to pick from.
  @Get()
  findAll() {
    return this.checklists.listTemplates();
  }

  @RequirePermission('settings.manage')
  @Post()
  create(@Body() dto: CreateChecklistTemplateDto) {
    return this.checklists.createTemplate(dto);
  }

  @RequirePermission('settings.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateChecklistTemplateDto) {
    return this.checklists.updateTemplate(id, dto);
  }

  @RequirePermission('settings.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.checklists.removeTemplate(id);
  }
}

// Day-to-day assigning/ticking off checklists on the Boarding & DayCare
// calendar -- an operational action, not a Settings change, so (unlike the
// templates controller above) nothing here is gated beyond the default
// staff-only access every route already has.
@Controller('checklist-assignments')
export class ChecklistAssignmentsController {
  constructor(private readonly checklists: ChecklistsService) {}

  @Get()
  findForRange(@Query('from') from: string, @Query('to') to: string) {
    return this.checklists.findAssignmentsForRange(from, to);
  }

  @Post()
  assign(@Body() dto: AssignChecklistDto) {
    return this.checklists.assign(dto);
  }

  // Ticking/unticking a single item -- separate from the general update
  // below so the "completed by" name always comes from the logged-in user,
  // never something the client could send in a body.
  @Patch(':id/items/:index')
  toggleItem(@Param('id') id: string, @Param('index') index: string, @CurrentUser() user: CurrentUserShape) {
    return this.checklists.toggleItem(id, Number(index), user.name);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateChecklistAssignmentDto, @CurrentUser() user: CurrentUserShape) {
    return this.checklists.updateAssignment(id, dto, user.name);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.checklists.removeAssignment(id);
  }
}
