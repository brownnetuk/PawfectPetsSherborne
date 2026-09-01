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
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { getClientIp } from '../common/client-ip.util';
import { PreviewTermsDto } from './dto/preview-terms.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { SendTriggeredEmailDto } from './dto/send-triggered-email.dto';
import { UpdateBusinessInfoDto } from './dto/update-business-info.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { UpdateVisitMappingDto } from './dto/update-visit-mapping.dto';
import { UpsertEmailTemplateDto } from './dto/upsert-email-template.dto';
import { EmailTrigger } from './schemas/email-template.schema';
import { SettingsService } from './settings.service';

// Staff-only by default (the global JWT guard), same as the rest of settings --
// the exceptions are GET /settings/terms, GET /settings/vet-authorisation,
// GET /settings/off-lead-consent, and GET /settings/declaration below, which
// the public intake form needs in order to show the business's own wording
// on its own steps.
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('business')
  getBusinessInfo() {
    return this.settingsService.getBusinessInfo();
  }

  // Public: the customer-facing public invoice/quote pages (see
  // {{invoice_link}}/{{quote_link}}) need this to render the business's
  // name/address/logo/bank details -- exactly the same fields already sent
  // out in every invoice/quote/deposit-request email, just fetched by that
  // page instead of interpolated server-side.
  @Public()
  @Get('business/public')
  getBusinessInfoPublic() {
    return this.settingsService.getBusinessInfo();
  }

  @RequirePermission('settings.manage')
  @Patch('business')
  updateBusinessInfo(@Body() dto: UpdateBusinessInfoDto) {
    return this.settingsService.updateBusinessInfo(dto);
  }

  // Lets the Trusted IPs card (Settings > Business Info) offer "add my
  // current IP" without staff having to go find it on some other site.
  @Get('my-ip')
  getMyIp(@Req() req: Request) {
    return { ip: getClientIp(req) ?? null };
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

  @RequirePermission('settings.manage')
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

  @Public()
  @Get('off-lead-consent')
  getOffLeadConsentText() {
    return this.settingsService.getOffLeadConsentText();
  }

  @Public()
  @Get('declaration')
  getDeclarationText() {
    return this.settingsService.getDeclarationText();
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

  // Read by the Bookings settings tab's Visits card, and by whatever
  // Bookings-calendar logic later maps a day's visit count/type to a
  // product -- not gated, same as GET /products.
  @Get('visits')
  getVisitMapping() {
    return this.settingsService.getVisitMapping();
  }

  @RequirePermission('settings.manage')
  @Patch('visits')
  updateVisitMapping(@Body() dto: UpdateVisitMappingDto) {
    return this.settingsService.updateVisitMapping(dto);
  }

  @Get('email')
  getEmailSettings() {
    return this.settingsService.getEmailSettings();
  }

  @RequirePermission('settings.manage')
  @Patch('email')
  updateEmailSettings(@Body() dto: UpdateEmailSettingsDto) {
    return this.settingsService.updateEmailSettings(dto);
  }

  @RequirePermission('settings.manage')
  @Post('email/test')
  sendTestEmail(@Body() dto: SendTestEmailDto) {
    return this.settingsService.sendTestEmail(dto);
  }

  // Not gated: this is the generic "send an email" endpoint used by routine,
  // everyday customer-communication flows (RegistrationLinkModal, "Request
  // Update", SendFormModal, AddPetChoiceModal) -- it just happens to live in
  // this controller, it isn't itself a Settings action.
  @Post('email/send')
  sendTriggeredEmail(@Body() dto: SendTriggeredEmailDto) {
    return this.settingsService.sendTriggeredEmail(dto);
  }

  @Get('email-templates')
  listEmailTemplates() {
    return this.settingsService.listEmailTemplates();
  }

  @RequirePermission('settings.manage')
  @Put('email-templates/:trigger')
  upsertEmailTemplate(
    @Param('trigger', new ParseEnumPipe(EmailTrigger)) trigger: EmailTrigger,
    @Body() dto: UpsertEmailTemplateDto,
  ) {
    return this.settingsService.upsertEmailTemplate(trigger, dto);
  }

  @RequirePermission('settings.manage')
  @Delete('email-templates/:trigger')
  deleteEmailTemplate(
    @Param('trigger', new ParseEnumPipe(EmailTrigger)) trigger: EmailTrigger,
  ) {
    return this.settingsService.deleteEmailTemplate(trigger);
  }
}
