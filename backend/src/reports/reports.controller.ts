import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('income-vs-expenses')
  incomeVsExpenses(@Query('months') months?: string) {
    return this.reportsService.incomeVsExpenses(months ? Number(months) : 6);
  }

  @Get('expenses-by-category')
  expensesByCategory(@Query('months') months?: string) {
    return this.reportsService.expensesByCategory(months ? Number(months) : 6);
  }
}
