import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateEmailGroupDto } from './dto/create-email-group.dto';
import { UpdateEmailGroupDto } from './dto/update-email-group.dto';
import { EmailGroupsService } from './email-groups.service';

@Controller('email-groups')
export class EmailGroupsController {
  constructor(private readonly emailGroupsService: EmailGroupsService) {}

  @Get()
  findAll() {
    return this.emailGroupsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.emailGroupsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateEmailGroupDto) {
    return this.emailGroupsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmailGroupDto) {
    return this.emailGroupsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.emailGroupsService.remove(id);
  }
}
