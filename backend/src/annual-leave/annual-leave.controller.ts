import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { AnnualLeaveService } from './annual-leave.service';
import { CreateAnnualLeaveDto } from './dto/create-annual-leave.dto';

@Controller('annual-leave')
export class AnnualLeaveController {
  constructor(private readonly annualLeaveService: AnnualLeaveService) {}

  @RequirePermission('settings.manage')
  @Post()
  create(@Body() dto: CreateAnnualLeaveDto) {
    return this.annualLeaveService.create(dto);
  }

  // Not gated: read by the Bookings calendar to block off days.
  @Get()
  findAll() {
    return this.annualLeaveService.findAll();
  }

  @RequirePermission('settings.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateAnnualLeaveDto) {
    return this.annualLeaveService.update(id, dto);
  }

  @RequirePermission('settings.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.annualLeaveService.remove(id);
  }
}
