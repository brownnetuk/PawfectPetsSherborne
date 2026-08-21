import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { SettingsService } from './settings.service';

// No @Public() anywhere here: settings, especially the Microsoft 365 client
// secret, are staff-only, protected by the global JWT guard by default.
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('email')
  getEmailSettings() {
    return this.settingsService.getEmailSettings();
  }

  @Patch('email')
  updateEmailSettings(@Body() dto: UpdateEmailSettingsDto) {
    return this.settingsService.updateEmailSettings(dto);
  }

  @Post('email/test')
  sendTestEmail(@Body() dto: SendTestEmailDto) {
    return this.settingsService.sendTestEmail(dto);
  }
}
