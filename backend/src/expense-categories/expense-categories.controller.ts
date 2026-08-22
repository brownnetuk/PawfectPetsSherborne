import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { ExpenseCategoriesService } from './expense-categories.service';

@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly expenseCategoriesService: ExpenseCategoriesService) {}

  @Post()
  create(@Body() dto: CreateExpenseCategoryDto) {
    return this.expenseCategoriesService.create(dto);
  }

  @Get()
  findAll() {
    return this.expenseCategoriesService.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateExpenseCategoryDto) {
    return this.expenseCategoriesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.expenseCategoriesService.remove(id);
  }
}
