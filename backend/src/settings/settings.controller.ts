import { Body, Controller, Delete, Get, Param, ParseEnumPipe, Patch, Post, Put } from '@nestjs/common';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { SendTriggeredEmailDto } from './dto/send-triggered-email.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { UpsertEmailTemplateDto } from './dto/upsert-email-template.dto';
import { EmailTrigger } from './schemas/email-template.schema';
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

  @Post('email/send')
  sendTriggeredEmail(@Body() dto: SendTriggeredEmailDto) {
    return this.settingsService.sendTriggeredEmail(dto);
  }

  @Get('email-templates')
  listEmailTemplates() {
    return this.settingsService.listEmailTemplates();
  }

  @Put('email-templates/:trigger')
  upsertEmailTemplate(
    @Param('trigger', new ParseEnumPipe(EmailTrigger)) trigger: EmailTrigger,
    @Body() dto: UpsertEmailTemplateDto,
  ) {
    return this.settingsService.upsertEmailTemplate(trigger, dto);
  }

  @Delete('email-templates/:trigger')
  deleteEmailTemplate(@Param('trigger', new ParseEnumPipe(EmailTrigger)) trigger: EmailTrigger) {
    return this.settingsService.deleteEmailTemplate(trigger);
  }
}
