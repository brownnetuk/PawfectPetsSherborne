import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CrmService } from './crm.service';
import { CreateCrmActivityDto } from './dto/create-crm-activity.dto';
import { UpdateCrmActivityDto } from './dto/update-crm-activity.dto';

@Controller('crm/activities')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Post()
  create(@Body() dto: CreateCrmActivityDto) {
    return this.crmService.create(dto);
  }

  @Get()
  findAll(@Query('customer') customer?: string) {
    return this.crmService.findAll(customer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.crmService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCrmActivityDto) {
    return this.crmService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.crmService.remove(id);
  }
}
