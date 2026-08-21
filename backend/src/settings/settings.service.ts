import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EncryptionService } from '../common/encryption/encryption.service';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { EmailSettings } from './schemas/email-settings.schema';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(EmailSettings.name) private readonly emailSettingsModel: Model<EmailSettings>,
    private readonly encryptionService: EncryptionService,
  ) {}

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

  /** Sends via Microsoft Graph, application-only auth (client credentials) -- see admin/README.md for the Azure setup this requires. */
  async sendTestEmail(dto: SendTestEmailDto): Promise<void> {
    const doc = await this.emailSettingsModel.findOne().exec();
    if (!doc?.tenantId || !doc.clientId || !doc.clientSecretEncrypted || !doc.fromAddress) {
      throw new BadRequestException(
        'Save a tenant ID, client ID, client secret, and from address before sending a test email.',
      );
    }
    const clientSecret = this.encryptionService.decrypt(doc.clientSecretEncrypted);
    const token = await this.getAccessToken(doc.tenantId, doc.clientId, clientSecret);

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(doc.fromAddress)}/sendMail`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject: 'PawfectPets Sherborne — test email',
            body: {
              contentType: 'Text',
              content:
                'This is a test email sent from the PawfectPets Sherborne admin dashboard to confirm your Microsoft 365 email settings are working.',
            },
            toRecipients: [{ emailAddress: { address: dto.to } }],
            from: { emailAddress: { address: doc.fromAddress } },
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
}
