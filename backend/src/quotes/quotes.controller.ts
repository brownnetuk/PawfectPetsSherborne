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
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';

// Pulls the customer id off a quote whether its `customer` is a raw ObjectId,
// a populated document, or absent (a manual-customer quote).
function customerIdOf(doc: { customer?: unknown }): string | null {
  const c = doc.customer as { _id?: unknown } | undefined;
  if (c == null) return null;
  return c._id != null ? String(c._id) : String(c);
}

@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly notificationService: NotificationService,
  ) {}

  @Post()
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: CurrentUserShape) {
    // The "new quote" customer push fires in QuotesService.create().
    return this.quotesService.create(dto, user.name);
  }

  @Get()
  findAll(@Query('customer') customer?: string) {
    return this.quotesService.findAll(customer);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.quotesService.findOne(id);
  }

  // The rendered quote PDF (same template as the web apps), downloaded by the
  // mobile app to display/print/share. Staff-authed like findOne above.
  @Get(':id/pdf')
  async pdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.quotesService.renderPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="quote-${id}.pdf"`,
    });
    return new StreamableFile(buffer);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateQuoteDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    const quote = await this.quotesService.update(id, dto, user.name);
    const customerId = customerIdOf(quote);
    if (customerId) {
      await this.notificationService.notifyCustomerDocument(
        customerId,
        'quote',
        quote.quoteNumber,
        'updated',
      );
    }
    return quote;
  }

  @RequirePermission('invoicing.manage')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.quotesService.remove(id, user.name);
  }

  @Post(':id/send')
  sendEmail(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.quotesService.sendEmail(id, user.name);
  }

  // Public: the customer's own quote page (see {{quote_link}}), with the
  // Accept/Reject actions below -- same access-token-by-id shape as
  // InvoicesController.findOnePublic().
  @Public()
  @Get(':id/public')
  findOnePublic(@Param('id') id: string) {
    return this.quotesService.findOne(id);
  }

  @Public()
  @Post(':id/accept')
  accept(@Param('id') id: string) {
    return this.quotesService.acceptAndConvert(id);
  }

  @Public()
  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.quotesService.reject(id);
  }

  // See InvoicesController.pixel() -- same public tracking-pixel pattern.
  @Public()
  @Get(':id/pixel.gif')
  async pixel(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.quotesService.markOpened(id).catch(() => {});
    res.set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    return new StreamableFile(transparentGifBuffer());
  }
}
