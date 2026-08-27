import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateInvoiceTermDto } from './dto/create-invoice-term.dto';
import { InvoiceTermsService } from './invoice-terms.service';

@Controller('invoice-terms')
export class InvoiceTermsController {
  constructor(private readonly invoiceTermsService: InvoiceTermsService) {}

  @RequirePermission('settings.manage')
  @Post()
  create(@Body() dto: CreateInvoiceTermDto) {
    return this.invoiceTermsService.create(dto);
  }

  // Not gated: read as the terms dropdown when any staff member creates an
  // invoice/quote.
  @Get()
  findAll() {
    return this.invoiceTermsService.findAll();
  }

  @RequirePermission('settings.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateInvoiceTermDto) {
    return this.invoiceTermsService.update(id, dto);
  }

  @RequirePermission('settings.manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.invoiceTermsService.remove(id);
  }
}
