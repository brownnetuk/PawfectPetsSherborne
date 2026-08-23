import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
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
// the exceptions are GET /settings/terms and GET /settings/vet-authorisation
// below, which the public intake form needs in order to show the business's
// terms and conditions / vet-authorisation wording on its own steps.
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

  // Public so it's reachable as a plain <img src> URL in outgoing emails --
  // see SettingsService.sendTemplatedEmail for why that has to be a real URL
  // rather than the stored data: URI.
  @Public()
  @Get('business/logo')
  async getLogo(@Res({ passthrough: true }) res: Response) {
    const { buffer, contentType } = await this.settingsService.getLogoFile();
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    });
    return new StreamableFile(buffer);
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

  @Public()
  @Get('vet-authorisation')
  getVetAuthorisationText() {
    return this.settingsService.getVetAuthorisationText();
  }

  @Get('terms/download')
  async downloadTerms(@Res({ passthrough: true }) res: Response) {
    const file = await this.settingsService.getTermsFile();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
    });
    return new StreamableFile(file.buffer);
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
  deleteEmailTemplate(
    @Param('trigger', new ParseEnumPipe(EmailTrigger)) trigger: EmailTrigger,
  ) {
    return this.settingsService.deleteEmailTemplate(trigger);
  }
}
