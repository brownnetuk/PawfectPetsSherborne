import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserShape } from '../auth/current-user.decorator';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';

// Staff-facing messaging (admin web + staff app). Protected by the global
// staff JwtAuthGuard. Literal routes are declared before ':customerId' so they
// aren't captured as a customer id.
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get('conversations')
  conversations() {
    return this.messages.listConversations();
  }

  @Get('unread-count')
  async unreadCount() {
    return { count: await this.messages.staffUnreadTotal() };
  }

  @Get(':customerId')
  thread(@Param('customerId') customerId: string) {
    return this.messages.openThreadAsStaff(customerId);
  }

  @Post(':customerId')
  send(
    @Param('customerId') customerId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: CurrentUserShape,
  ) {
    return this.messages.staffSend(customerId, dto.body, user.name);
  }

  // Staff can delete any message in a thread. customerId is in the path for
  // clarity/scoping; deletion is by message id.
  @Delete(':customerId/:messageId')
  remove(@Param('messageId') messageId: string) {
    return this.messages.staffDelete(messageId);
  }
}
