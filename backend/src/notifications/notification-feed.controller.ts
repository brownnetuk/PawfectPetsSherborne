import { Controller, Get, Post } from '@nestjs/common';
import { NotificationService } from './notification.service';

// The admin app's notification centre (the bell): recent notifications, the
// unread count for the red dot, and mark-all-read.
@Controller('notifications')
export class NotificationFeedController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list() {
    return this.notifications.listRecent();
  }

  @Get('unread-count')
  async unreadCount() {
    return { count: await this.notifications.unreadCount() };
  }

  @Post('mark-read')
  async markRead() {
    await this.notifications.markAllRead();
    return { ok: true };
  }
}
