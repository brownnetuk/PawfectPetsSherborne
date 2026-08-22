import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findForCustomer(@Query('customer') customer?: string) {
    if (!customer) {
      throw new BadRequestException('customer query parameter is required');
    }
    return this.auditLogService.findForCustomer(customer);
  }

  @Get('income')
  income(
    @Query('customer') customer?: string,
    @Query('months') months?: string,
  ) {
    if (!customer) {
      throw new BadRequestException('customer query parameter is required');
    }
    const parsed = Number(months);
    return this.auditLogService.incomeByMonth(
      customer,
      Number.isFinite(parsed) && parsed > 0 ? parsed : 6,
    );
  }
}
