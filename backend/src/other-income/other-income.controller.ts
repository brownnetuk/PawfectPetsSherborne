import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateOtherIncomeDto } from './dto/create-other-income.dto';
import { UpdateOtherIncomeDto } from './dto/update-other-income.dto';
import { OtherIncomeService } from './other-income.service';

@Controller('other-income')
export class OtherIncomeController {
  constructor(private readonly otherIncomeService: OtherIncomeService) {}

  @Post()
  create(@Body() dto: CreateOtherIncomeDto) {
    return this.otherIncomeService.create(dto);
  }

  @Get()
  findAll() {
    return this.otherIncomeService.findAll();
  }

  @RequirePermission('financial.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOtherIncomeDto) {
    return this.otherIncomeService.update(id, dto);
  }

  @RequirePermission('financial.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.otherIncomeService.remove(id);
  }
}
