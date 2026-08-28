import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateVetPracticeDto } from './dto/create-vet-practice.dto';
import { VetPracticesService } from './vet-practices.service';

@Controller('vet-practices')
export class VetPracticesController {
  constructor(private readonly vetPracticesService: VetPracticesService) {}

  @RequirePermission('settings.manage')
  @Post()
  create(@Body() dto: CreateVetPracticeDto) {
    return this.vetPracticesService.create(dto);
  }

  // Public: the customer intake form (unauthenticated) lists these for its
  // Vet Practice dropdown, same reasoning as GET /settings/vet-authorisation.
  @Public()
  @Get()
  findAll() {
    return this.vetPracticesService.findAll();
  }

  @RequirePermission('settings.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateVetPracticeDto) {
    return this.vetPracticesService.update(id, dto);
  }

  @RequirePermission('settings.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.vetPracticesService.remove(id);
  }
}
