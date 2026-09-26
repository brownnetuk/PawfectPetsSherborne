import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { PublishVersionDto } from './dto/publish-version.dto';
import { SignPolicyDto } from './dto/sign-policy.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import { PoliciesService } from './policies.service';

@Controller('policies')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Get()
  findAll() {
    return this.policiesService.findAll();
  }

  // Ungated, and declared before ':id' so "staff" isn't swallowed as an id --
  // any staff member composing a policy/version needs this for the sign-off
  // picker, not just those with staff.manage.
  @Get('staff')
  listStaffOptions() {
    return this.policiesService.listStaffOptions();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.policiesService.findOne(id);
  }

  @RequirePermission('bookings.manage')
  @Post()
  create(@Body() dto: CreatePolicyDto, @CurrentUser() user: CurrentUserShape) {
    return this.policiesService.create(dto, user.name);
  }

  @RequirePermission('bookings.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePolicyDto, @CurrentUser() user: CurrentUserShape) {
    return this.policiesService.update(id, dto, user.name);
  }

  @RequirePermission('bookings.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.policiesService.remove(id);
  }

  @RequirePermission('bookings.manage')
  @Post(':id/versions')
  publishVersion(
    @Param('id') id: string,
    @Body() dto: PublishVersionDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.policiesService.publishVersion(id, dto, user.name);
  }

  // No @RequirePermission -- any logged-in staff member completes their own
  // Policy Review.
  @Post(':id/sign')
  signOff(@Param('id') id: string, @Body() dto: SignPolicyDto, @CurrentUser() user: CurrentUserShape) {
    return this.policiesService.signOff(id, user.id, user.name, dto.signedName);
  }

  @RequirePermission('bookings.manage')
  @Post(':id/remind')
  sendReminder(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.policiesService.sendReminder(id, user.name);
  }
}
