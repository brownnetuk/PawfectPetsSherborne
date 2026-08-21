import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateInvoiceTermDto } from './dto/create-invoice-term.dto';
import { InvoiceTermsService } from './invoice-terms.service';

@Controller('invoice-terms')
export class InvoiceTermsController {
  constructor(private readonly invoiceTermsService: InvoiceTermsService) {}

  @Post()
  create(@Body() dto: CreateInvoiceTermDto) {
    return this.invoiceTermsService.create(dto);
  }

  @Get()
  findAll() {
    return this.invoiceTermsService.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: CreateInvoiceTermDto) {
    return this.invoiceTermsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.invoiceTermsService.remove(id);
  }
}
