import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { transparentGifBuffer } from '../common/tracking-pixel.util';
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

  // Public: fetched by the recipient's mail client, not the admin app -- see
  // InvoicesController's identical pixel route for why this never errors on
  // a bad/already-opened id, just serves the gif regardless.
  @Public()
  @Get(':id/pixel.gif')
  async pixel(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    await this.auditLogService.markOpened(id).catch(() => {});
    res.set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    return new StreamableFile(transparentGifBuffer());
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
