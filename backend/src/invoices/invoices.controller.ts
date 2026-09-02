import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { transparentGifBuffer } from '../common/tracking-pixel.util';
import { NotificationService } from '../notifications/notification.service';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';

// Pulls the customer id off an invoice whether its `customer` is a raw
// ObjectId or a populated document.
function customerIdOf(doc: { customer?: unknown }): string | null {
  const c = doc.customer as { _id?: unknown } | undefined;
  if (c == null) return null;
  return c._id != null ? String(c._id) : String(c);
}

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly notificationService: NotificationService,
  ) {}

  @Post()
  async create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: CurrentUserShape) {
    const invoice = await this.invoicesService.create(dto, user.name);
    const customerId = customerIdOf(invoice);
    if (customerId) {
      await this.notificationService.notifyCustomerDocument(
        customerId,
        'invoice',
        invoice.invoiceNumber,
        'new',
      );
    }
    return invoice;
  }

  @Get()
  findAll(@Query('customer') customer?: string) {
    return this.invoicesService.findAll(customer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  // The rendered invoice PDF (same template as the web apps), downloaded by
  // the mobile app to display/print/share. Staff-authed like findOne above.
  @Get(':id/pdf')
  async pdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.invoicesService.renderPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="invoice-${id}.pdf"`,
    });
    return new StreamableFile(buffer);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    const invoice = await this.invoicesService.update(id, dto, user.name);
    const customerId = customerIdOf(invoice);
    if (customerId) {
      await this.notificationService.notifyCustomerDocument(
        customerId,
        'invoice',
        invoice.invoiceNumber,
        'updated',
      );
    }
    return invoice;
  }

  @RequirePermission('invoicing.manage')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.invoicesService.remove(id, user.name);
  }

  @Post(':id/send')
  sendEmail(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.invoicesService.sendEmail(id, user.name);
  }

  @Post(':id/request-deposit')
  requestDeposit(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.invoicesService.requestDeposit(id, user.name);
  }

  // Public: the customer's own invoice page (see {{invoice_link}}) -- same
  // shape as the staff findOne() above, just reachable with no JWT. The
  // invoice's own id is effectively its access token here, same as the
  // public form-submission/intake routes elsewhere in this app.
  @Public()
  @Get(':id/public')
  findOnePublic(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  // Public: this is fetched by the recipient's mail client, not the admin app --
  // it never carries a staff JWT. Ignores an invalid/already-deleted id rather
  // than erroring, since a 404 image just renders as broken in the email either
  // way and there's nothing useful to report back to a mail client.
  @Public()
  @Get(':id/pixel.gif')
  async pixel(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.invoicesService.markOpened(id).catch(() => {});
    res.set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    return new StreamableFile(transparentGifBuffer());
  }
}
