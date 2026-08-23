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
import { transparentGifBuffer } from '../common/tracking-pixel.util';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: CurrentUserShape) {
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

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQuoteDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.quotesService.update(id, dto, user.name);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.quotesService.remove(id, user.name);
  }

  @Post(':id/send')
  sendEmail(@Param('id') id: string, @CurrentUser() user: CurrentUserShape) {
    return this.quotesService.sendEmail(id, user.name);
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
