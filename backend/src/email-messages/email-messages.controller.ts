import { Body, Controller, Delete, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StreamableFile } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { transparentGifBuffer } from '../common/tracking-pixel.util';
import { SendEmailMessageDto } from './dto/send-email-message.dto';
import { EmailMessagesService } from './email-messages.service';

// Communications > Email (one-off bulk emails to customers or groups).
// Ungated, same as /push-messages -- any logged-in staff member can send.
@Controller('email-messages')
export class EmailMessagesController {
  constructor(private readonly emailMessages: EmailMessagesService) {}

  @Get()
  findAll() {
    return this.emailMessages.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.emailMessages.findOne(id);
  }

  @Post()
  send(@Body() dto: SendEmailMessageDto, @CurrentUser() user: CurrentUserShape) {
    return this.emailMessages.send(dto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.emailMessages.remove(id);
  }

  // Public: fetched by the recipient's own mail client, not the admin app --
  // same pattern as GET /invoices/:id/pixel.gif.
  @Public()
  @Get(':id/recipients/:recipientId/pixel.gif')
  async pixel(
    @Param('id') id: string,
    @Param('recipientId') recipientId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.emailMessages.markOpened(id, recipientId).catch(() => {});
    res.set({
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    return new StreamableFile(transparentGifBuffer());
  }
}
