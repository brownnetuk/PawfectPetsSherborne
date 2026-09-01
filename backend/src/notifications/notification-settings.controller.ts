import { Body, Controller, Get, Patch } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { NotificationSettingsService } from './notification-settings.service';

@Controller('settings/notifications')
export class NotificationSettingsController {
  constructor(private readonly settings: NotificationSettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @RequirePermission('settings.manage')
  @Patch()
  update(@Body() dto: UpdateNotificationSettingsDto) {
    return this.settings.update(dto);
  }
}
