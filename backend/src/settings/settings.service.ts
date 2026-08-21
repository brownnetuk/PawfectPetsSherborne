import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EncryptionService } from '../common/encryption/encryption.service';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { SendTriggeredEmailDto } from './dto/send-triggered-email.dto';
import { UpdateBusinessInfoDto } from './dto/update-business-info.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { UpsertEmailTemplateDto } from './dto/upsert-email-template.dto';
import { BusinessInfo } from './schemas/business-info.schema';
import { EmailSettings } from './schemas/email-settings.schema';
import { EmailTemplate, EmailTrigger } from './schemas/email-template.schema';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(BusinessInfo.name) private readonly businessInfoModel: Model<BusinessInfo>,
    @InjectModel(EmailSettings.name) private readonly emailSettingsModel: Model<EmailSettings>,
    @InjectModel(EmailTemplate.name) private readonly emailTemplateModel: Model<EmailTemplate>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getBusinessInfo() {
    const doc = await this.businessInfoModel.findOne().exec();
    return {
      name: doc?.name ?? '',
      address: doc?.address ?? '',
      town: doc?.town ?? '',
      postcode: doc?.postcode ?? '',
      telephone: doc?.telephone ?? '',
      email: doc?.email ?? '',
      website: doc?.website ?? '',
      logoImage: doc?.logoImage ?? '',
    };
  }

  async updateBusinessInfo(dto: UpdateBusinessInfoDto) {
    const update: Record<string, unknown> = {};
    if (dto.name !== undefined) update.name = dto.name;
    if (dto.address !== undefined) update.address = dto.address;
    if (dto.town !== undefined) update.town = dto.town;
    if (dto.postcode !== undefined) update.postcode = dto.postcode;
    if (dto.telephone !== undefined) update.telephone = dto.telephone;
    if (dto.email !== undefined) update.email = dto.email;
    if (dto.website !== undefined) update.website = dto.website;
    if (dto.logoImage !== undefined) update.logoImage = dto.logoImage;
    await this.businessInfoModel.findOneAndUpdate({}, update, { upsert: true }).exec();
    return this.getBusinessInfo();
  }

  async getEmailSettings() {
    const doc = await this.emailSettingsModel.findOne().exec();
    return {
      tenantId: doc?.tenantId ?? '',
      clientId: doc?.clientId ?? '',
      fromAddress: doc?.fromAddress ?? '',
      fromName: doc?.fromName ?? '',
      // The secret itself is never sent back to the browser once saved --
      // only whether one is on file, mirroring how alarm instructions work.
      clientSecretConfigured: !!doc?.clientSecretEncrypted,
    };
  }

  async updateEmailSettings(dto: UpdateEmailSettingsDto) {
    const update: Record<string, unknown> = {};
    if (dto.tenantId !== undefined) update.tenantId = dto.tenantId;
    if (dto.clientId !== undefined) update.clientId = dto.clientId;
    if (dto.fromAddress !== undefined) update.fromAddress = dto.fromAddress;
    if (dto.fromName !== undefined) update.fromName = dto.fromName;
    if (dto.clientSecret) {
      update.clientSecretEncrypted = this.encryptionService.encrypt(dto.clientSecret);
    }
    await this.emailSettingsModel.findOneAndUpdate({}, update, { upsert: true }).exec();
    return this.getEmailSettings();
  }

  listEmailTemplates() {
    return this.emailTemplateModel.find().exec();
  }

  async upsertEmailTemplate(trigger: EmailTrigger, dto: UpsertEmailTemplateDto) {
    return this.emailTemplateModel
      .findOneAndUpdate({ trigger }, { trigger, ...dto }, { upsert: true, new: true })
      .exec();
  }

  async deleteEmailTemplate(trigger: EmailTrigger): Promise<void> {
    const result = await this.emailTemplateModel.findOneAndDelete({ trigger }).exec();
    if (!result) {
      throw new NotFoundException(`No email template configured for "${trigger}"`);
    }
  }

  private async getAccessToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
    const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    if (!res.ok) {
      throw new BadRequestException(
        (body.error_description as string) || 'Microsoft rejected the tenant ID, client ID, or client secret.',
      );
    }
    return body.access_token as string;
  }

  /** Loads and decrypts the stored connection, failing with a clear message if it isn't fully set up yet. */
  private async getSendableSettings() {
    const doc = await this.emailSettingsModel.findOne().exec();
    if (!doc?.tenantId || !doc.clientId || !doc.clientSecretEncrypted || !doc.fromAddress) {
      throw new BadRequestException(
        'Email sending isn\'t set up yet -- save a tenant ID, client ID, client secret, and from address in Settings > Email first.',
      );
    }
    let clientSecret: string;
    try {
      clientSecret = this.encryptionService.decrypt(doc.clientSecretEncrypted);
    } catch {
      // Most likely cause: ENCRYPTION_KEY here doesn't match whatever process
      // originally saved the secret (e.g. running locally against data saved
      // via a deployed environment with a different key) -- not something
      // resaving the same secret value would fix, so point at the real cause.
      throw new BadRequestException(
        'Could not decrypt the stored client secret -- this usually means ENCRYPTION_KEY has changed since it was saved. Re-enter the client secret in Settings > Email to fix it.',
      );
    }
    return { tenantId: doc.tenantId, clientId: doc.clientId, clientSecret, fromAddress: doc.fromAddress };
  }

  /** Sends via Microsoft Graph, application-only auth (client credentials) -- see admin/README.md for the Azure setup this requires. */
  private async graphSendMail(fromAddress: string, token: string, to: string, subject: string, content: string) {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddress)}/sendMail`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: 'Text', content },
            toRecipients: [{ emailAddress: { address: to } }],
            from: { emailAddress: { address: fromAddress } },
          },
          saveToSentItems: true,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as Record<string, unknown>);
      const error = body.error as { message?: string } | undefined;
      throw new BadRequestException(error?.message || 'Microsoft Graph rejected the send request.');
    }
  }

  async sendTestEmail(dto: SendTestEmailDto): Promise<void> {
    const settings = await this.getSendableSettings();
    const token = await this.getAccessToken(settings.tenantId, settings.clientId, settings.clientSecret);
    await this.graphSendMail(
      settings.fromAddress,
      token,
      dto.to,
      'PawfectPets Sherborne — test email',
      'This is a test email sent from the PawfectPets Sherborne admin dashboard to confirm your Microsoft 365 email settings are working.',
    );
  }

  /** Sends a customer-facing email using the template configured for the given trigger (e.g. "here's your registration link"). */
  async sendTriggeredEmail(dto: SendTriggeredEmailDto): Promise<void> {
    const template = await this.emailTemplateModel.findOne({ trigger: dto.trigger }).exec();
    if (!template) {
      throw new BadRequestException(
        `No email template is set up for this yet -- add one in Settings > Email Templates first.`,
      );
    }
    const vars: Record<string, string> = { name: dto.name, link: dto.link };
    const interpolate = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');

    const settings = await this.getSendableSettings();
    const token = await this.getAccessToken(settings.tenantId, settings.clientId, settings.clientSecret);
    await this.graphSendMail(
      settings.fromAddress,
      token,
      dto.to,
      interpolate(template.subject),
      interpolate(template.body),
    );
  }
}
