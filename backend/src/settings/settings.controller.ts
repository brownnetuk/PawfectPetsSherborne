import { Body, Controller, Delete, Get, Param, ParseEnumPipe, Patch, Post, Put } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { PreviewTermsDto } from './dto/preview-terms.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { SendTriggeredEmailDto } from './dto/send-triggered-email.dto';
import { UpdateBusinessInfoDto } from './dto/update-business-info.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { UpsertEmailTemplateDto } from './dto/upsert-email-template.dto';
import { EmailTrigger } from './schemas/email-template.schema';
import { SettingsService } from './settings.service';

// Staff-only by default (the global JWT guard), same as the rest of settings --
// the one exception is GET /settings/terms below, which the public intake form
// needs in order to show the business's terms and conditions on its agreement step.
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('business')
  getBusinessInfo() {
    return this.settingsService.getBusinessInfo();
  }

  @Patch('business')
  updateBusinessInfo(@Body() dto: UpdateBusinessInfoDto) {
    return this.settingsService.updateBusinessInfo(dto);
  }

  @Post('terms/preview')
  previewTerms(@Body() dto: PreviewTermsDto) {
    return this.settingsService.previewTerms(dto);
  }

  @Public()
  @Get('terms')
  getTermsHtml() {
    return this.settingsService.getTermsHtml();
  }

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
