import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { NotificationService } from './notification.service';

// The admin app's notification centre (the bell): recent notifications, the
// unread count for the red dot, mark-all-read, and clear-all.
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

  // One notification read, e.g. a staff member tapped its push on their phone.
  @Post(':id/read')
  async markOneRead(@Param('id') id: string) {
    await this.notifications.markRead(id);
    return { ok: true };
  }

  @Delete()
  async clear() {
    await this.notifications.clearAll();
    return { ok: true };
  }
}
