import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { CreatePushMessageDto } from './dto/create-push-message.dto';
import { PushMessagesService } from './push-messages.service';

// Communications > Push Messages (broadcast pushes to customers, bulk or
// individual). Ungated, same as /messages -- any logged-in staff member can
// send.
@Controller('push-messages')
export class PushMessagesController {
  constructor(private readonly pushMessages: PushMessagesService) {}

  @Get()
  findAll() {
    return this.pushMessages.findAll();
  }

  @Post()
  send(@Body() dto: CreatePushMessageDto, @CurrentUser() user: CurrentUserShape) {
    return this.pushMessages.send(dto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pushMessages.remove(id);
  }
}
