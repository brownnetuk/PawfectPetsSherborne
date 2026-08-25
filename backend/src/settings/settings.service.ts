import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as mammoth from 'mammoth';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import { EncryptionService } from '../common/encryption/encryption.service';
import { escapeHtml } from '../common/html.util';
import { publicApiUrl, trackingPixelHtml } from '../common/tracking-pixel.util';
import { PreviewTermsDto } from './dto/preview-terms.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { SendTriggeredEmailDto } from './dto/send-triggered-email.dto';
import { UpdateBusinessInfoDto } from './dto/update-business-info.dto';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';
import { UpsertEmailTemplateDto } from './dto/upsert-email-template.dto';
import { BusinessInfo } from './schemas/business-info.schema';
import { EmailSettings } from './schemas/email-settings.schema';
import { EmailTemplate, EmailTrigger } from './schemas/email-template.schema';

// The original hardcoded copy on the intake form's "Alternative vet care
// authorisation" step, kept as the fallback so an unconfigured BusinessInfo
// document doesn't leave that step with blank text.
const DEFAULT_EMERGENCY_VET_AUTHORISATION_TEXT =
  'I authorise PawfectPets Sherborne to arrange alternative veterinary care for my pet if my usual vet is unobtainable in an emergency.';

// Same idea, for the Off-lead consent section (dogs only) -- {{petName}} is
// substituted with the actual pet's name wherever this is rendered.
const DEFAULT_OFF_LEAD_CONSENT_TEXT =
  'I consent to {{petName}} being exercised off the lead, and understand this is at my own risk.';

// Same idea, for the Client agreement step's Declaration section.
const DEFAULT_DECLARATION_TEXT =
  'I confirm that the information provided in this form is accurate and complete to the best of my knowledge, and I agree to be bound by the terms set out above.';

// Default deposit percentage until staff configure their own in Settings > Deposit.
const DEFAULT_DEPOSIT_PERCENTAGE = 20;

// "Sent"/"read" Activity titles for sendTriggeredEmail's tracking-pixel
// entries -- PAYMENT_RECEIVED/INVOICE/QUOTE aren't here since those go
// through InvoicesService/QuotesService's own send flow (already logs
// EMAILED, and now READ too), not this generic path.
const TRIGGERED_EMAIL_TITLES: Partial<Record<EmailTrigger, { sent: string; read: string }>> = {
  [EmailTrigger.REGISTRATION]: { sent: 'Registration email sent', read: 'Registration email read' },
  [EmailTrigger.UPDATE_INFO]: { sent: 'Update request email sent', read: 'Update request email read' },
  [EmailTrigger.ADD_PET]: { sent: 'Add pet email sent', read: 'Add pet email read' },
  [EmailTrigger.FORM]: { sent: 'Form email sent', read: 'Form email read' },
};

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(BusinessInfo.name)
    private readonly businessInfoModel: Model<BusinessInfo>,
    @InjectModel(EmailSettings.name)
    private readonly emailSettingsModel: Model<EmailSettings>,
    @InjectModel(EmailTemplate.name)
    private readonly emailTemplateModel: Model<EmailTemplate>,
    private readonly encryptionService: EncryptionService,
    private readonly auditLogService: AuditLogService,
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
      termsHtml: doc?.termsHtml ?? '',
      termsFileName: doc?.termsFileName ?? '',
      termsVersion: doc?.termsVersion ?? '',
      termsDocumentDate: doc?.termsDocumentDate ?? '',
      emergencyVetAuthorisationText:
        doc?.emergencyVetAuthorisationText ??
        DEFAULT_EMERGENCY_VET_AUTHORISATION_TEXT,
      offLeadConsentText:
        doc?.offLeadConsentText ?? DEFAULT_OFF_LEAD_CONSENT_TEXT,
      declarationText: doc?.declarationText ?? DEFAULT_DECLARATION_TEXT,
      depositPercentage: doc?.depositPercentage ?? DEFAULT_DEPOSIT_PERCENTAGE,
      bankName: doc?.bankName ?? '',
      sortCode: doc?.sortCode ?? '',
      accountNumber: doc?.accountNumber ?? '',
      invoiceNumberTemplate: doc?.invoiceNumberTemplate ?? 'INV-{year}-{seq}',
      invoiceNextNumber: doc?.invoiceNextNumber ?? 1,
      quoteNumberTemplate: doc?.quoteNumberTemplate ?? 'QUO-{year}-{seq}',
      quoteNextNumber: doc?.quoteNextNumber ?? 1,
      paymentNumberTemplate: doc?.paymentNumberTemplate ?? 'PAY-{year}-{seq}',
      paymentNextNumber: doc?.paymentNextNumber ?? 1,
      creditNoteNumberTemplate:
        doc?.creditNoteNumberTemplate ?? 'CN-{year}-{seq}',
      creditNoteNextNumber: doc?.creditNoteNextNumber ?? 1,
      invoicePdfTemplate: doc?.invoicePdfTemplate ?? [],
      trustedIps: doc?.trustedIps ?? [],
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
    if (dto.termsFile !== undefined) {
      if (dto.termsFile) {
        update.termsHtml = await this.parseTermsDocx(dto.termsFile);
        update.termsDocx = dto.termsFile;
        update.termsFileName = dto.termsFileName ?? '';
      } else {
        update.termsHtml = '';
        update.termsDocx = '';
        update.termsFileName = '';
      }
    }
    if (dto.termsVersion !== undefined) update.termsVersion = dto.termsVersion;
    if (dto.termsDocumentDate !== undefined)
      update.termsDocumentDate = dto.termsDocumentDate;
    if (dto.emergencyVetAuthorisationText !== undefined)
      update.emergencyVetAuthorisationText = dto.emergencyVetAuthorisationText;
    if (dto.offLeadConsentText !== undefined)
      update.offLeadConsentText = dto.offLeadConsentText;
    if (dto.declarationText !== undefined)
      update.declarationText = dto.declarationText;
    if (dto.depositPercentage !== undefined)
      update.depositPercentage = dto.depositPercentage;
    if (dto.bankName !== undefined) update.bankName = dto.bankName;
    if (dto.sortCode !== undefined) update.sortCode = dto.sortCode;
    if (dto.accountNumber !== undefined)
      update.accountNumber = dto.accountNumber;
    if (dto.invoiceNumberTemplate !== undefined)
      update.invoiceNumberTemplate = dto.invoiceNumberTemplate;
    if (dto.invoiceNextNumber !== undefined)
      update.invoiceNextNumber = dto.invoiceNextNumber;
    if (dto.quoteNumberTemplate !== undefined)
      update.quoteNumberTemplate = dto.quoteNumberTemplate;
    if (dto.quoteNextNumber !== undefined)
      update.quoteNextNumber = dto.quoteNextNumber;
    if (dto.paymentNumberTemplate !== undefined)
      update.paymentNumberTemplate = dto.paymentNumberTemplate;
    if (dto.paymentNextNumber !== undefined)
      update.paymentNextNumber = dto.paymentNextNumber;
    if (dto.creditNoteNumberTemplate !== undefined)
      update.creditNoteNumberTemplate = dto.creditNoteNumberTemplate;
    if (dto.creditNoteNextNumber !== undefined)
      update.creditNoteNextNumber = dto.creditNoteNextNumber;
    if (dto.invoicePdfTemplate !== undefined)
      update.invoicePdfTemplate = dto.invoicePdfTemplate;
    if (dto.trustedIps !== undefined) update.trustedIps = dto.trustedIps;
    await this.businessInfoModel
      .findOneAndUpdate({}, update, { upsert: true })
      .exec();
    return this.getBusinessInfo();
  }

  async previewTerms(dto: PreviewTermsDto): Promise<{ html: string }> {
    return { html: await this.parseTermsDocx(dto.termsFile) };
  }

  /** Returns just the parsed terms HTML -- the public intake form's agreement step reads this. */
  async getTermsHtml(): Promise<{ html: string }> {
    const doc = await this.businessInfoModel
      .findOne()
      .select('termsHtml')
      .exec();
    return { html: doc?.termsHtml ?? '' };
  }

  /** Returns just the vet-authorisation text -- the public intake form's Emergency Vet step reads this. */
  async getVetAuthorisationText(): Promise<{ text: string }> {
    const doc = await this.businessInfoModel
      .findOne()
      .select('emergencyVetAuthorisationText')
      .exec();
    return {
      text:
        doc?.emergencyVetAuthorisationText ??
        DEFAULT_EMERGENCY_VET_AUTHORISATION_TEXT,
    };
  }

  /** Returns just the off-lead consent text -- the public intake form's Pet details step reads this. */
  async getOffLeadConsentText(): Promise<{ text: string }> {
    const doc = await this.businessInfoModel
      .findOne()
      .select('offLeadConsentText')
      .exec();
    return {
      text: doc?.offLeadConsentText ?? DEFAULT_OFF_LEAD_CONSENT_TEXT,
    };
  }

  /** Returns just the declaration text -- the public intake form's Client agreement step reads this. */
  async getDeclarationText(): Promise<{ text: string }> {
    const doc = await this.businessInfoModel
      .findOne()
      .select('declarationText')
      .exec();
    return {
      text: doc?.declarationText ?? DEFAULT_DECLARATION_TEXT,
    };
  }

  /** Returns the original uploaded .docx for download -- never re-parsed, just handed back as-is. */
  async getTermsFile(): Promise<{ buffer: Buffer; fileName: string }> {
    const doc = await this.businessInfoModel
      .findOne()
      .select('termsDocx termsHtml termsFileName')
      .exec();
    if (!doc?.termsDocx) {
      if (doc?.termsHtml) {
        // Terms uploaded before this feature existed only kept the parsed
        // HTML, not the original file -- there's genuinely nothing to serve.
        throw new BadRequestException(
          "The original file for the current terms isn't available to download -- this can happen for terms uploaded before downloading was supported. Re-upload the file to make it downloadable.",
        );
      }
      throw new NotFoundException(
        'No terms and conditions file has been uploaded.',
      );
    }
    const base64 = doc.termsDocx.includes(',')
      ? doc.termsDocx.slice(doc.termsDocx.indexOf(',') + 1)
      : doc.termsDocx;
    return {
      buffer: Buffer.from(base64, 'base64'),
      fileName: doc.termsFileName || 'terms.docx',
    };
  }

  /**
   * Returns the uploaded logo as raw image bytes/content-type, so it can be
   * served at a real URL. Outgoing emails reference that URL rather than
   * embedding the stored data: URI directly -- Gmail (and several other mail
   * clients) strip data: URIs from received email HTML, which silently
   * breaks the logo despite it rendering fine in every in-app preview.
   */
  async getLogoFile(): Promise<{ buffer: Buffer; contentType: string }> {
    const doc = await this.businessInfoModel
      .findOne()
      .select('logoImage')
      .exec();
    const match = doc?.logoImage?.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) {
      throw new NotFoundException('No logo has been uploaded.');
    }
    const [, contentType, base64] = match;
    return { buffer: Buffer.from(base64, 'base64'), contentType };
  }

  /** Converts an uploaded .docx (base64 data URI) into HTML via mammoth. */
  private async parseTermsDocx(dataUri: string): Promise<string> {
    const base64 = dataUri.includes(',')
      ? dataUri.slice(dataUri.indexOf(',') + 1)
      : dataUri;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      throw new BadRequestException(
        "That doesn't look like a valid file upload.",
      );
    }
    try {
      const result = await mammoth.convertToHtml({ buffer });
      return result.value;
    } catch {
      throw new BadRequestException(
        "Could not read that .docx file -- make sure it's a valid Word document.",
      );
    }
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
      update.clientSecretEncrypted = this.encryptionService.encrypt(
        dto.clientSecret,
      );
    }
    await this.emailSettingsModel
      .findOneAndUpdate({}, update, { upsert: true })
      .exec();
    return this.getEmailSettings();
  }

  listEmailTemplates() {
    return this.emailTemplateModel.find().exec();
  }

  async upsertEmailTemplate(
    trigger: EmailTrigger,
    dto: UpsertEmailTemplateDto,
  ) {
    return this.emailTemplateModel
      .findOneAndUpdate(
        { trigger },
        { trigger, ...dto },
        { upsert: true, new: true },
      )
      .exec();
  }

  async deleteEmailTemplate(trigger: EmailTrigger): Promise<void> {
    const result = await this.emailTemplateModel
      .findOneAndDelete({ trigger })
      .exec();
    if (!result) {
      throw new NotFoundException(
        `No email template configured for "${trigger}"`,
      );
    }
  }

  private async getAccessToken(
    tenantId: string,
    clientId: string,
    clientSecret: string,
  ): Promise<string> {
    const res = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new BadRequestException(
        (body.error_description as string) ||
          'Microsoft rejected the tenant ID, client ID, or client secret.',
      );
    }
    return body.access_token as string;
  }

  /** Loads and decrypts the stored connection, failing with a clear message if it isn't fully set up yet. */
  private async getSendableSettings() {
    const doc = await this.emailSettingsModel.findOne().exec();
    if (
      !doc?.tenantId ||
      !doc.clientId ||
      !doc.clientSecretEncrypted ||
      !doc.fromAddress
    ) {
      throw new BadRequestException(
        "Email sending isn't set up yet -- save a tenant ID, client ID, client secret, and from address in Settings > Email first.",
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
    return {
      tenantId: doc.tenantId,
      clientId: doc.clientId,
      clientSecret,
      fromAddress: doc.fromAddress,
    };
  }

  /** Sends via Microsoft Graph, application-only auth (client credentials) -- see admin/README.md for the Azure setup this requires. */
  private async graphSendMail(
    fromAddress: string,
    token: string,
    to: string,
    subject: string,
    content: string,
    contentType: 'Text' | 'HTML' = 'Text',
  ) {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddress)}/sendMail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType, content },
            toRecipients: [{ emailAddress: { address: to } }],
            from: { emailAddress: { address: fromAddress } },
          },
          saveToSentItems: true,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const error = body.error as { message?: string } | undefined;
      throw new BadRequestException(
        error?.message || 'Microsoft Graph rejected the send request.',
      );
    }
  }

  async sendTestEmail(dto: SendTestEmailDto): Promise<void> {
    const settings = await this.getSendableSettings();
    const token = await this.getAccessToken(
      settings.tenantId,
      settings.clientId,
      settings.clientSecret,
    );
    await this.graphSendMail(
      settings.fromAddress,
      token,
      dto.to,
      'PawfectPets Sherborne — test email',
      'This is a test email sent from the PawfectPets Sherborne admin dashboard to confirm your Microsoft 365 email settings are working.',
    );
  }

  /**
   * Sends a customer-facing email using the template configured for the
   * given trigger (e.g. "here's your registration link"). When `customerId`
   * is given, also creates the "sent" Activity entry up front (before the
   * email goes out) so its own _id can be embedded as a tracking-pixel URL
   * in the email body -- the pixel firing later (GET /audit-log/:id/pixel.gif)
   * is what turns that into the paired "read" entry. Returns the created
   * entry's id so a caller that's about to attach a PDF snapshot (see
   * CustomersService.logFormSnapshot) can attach it to this same entry
   * instead of creating a second one.
   */
  async sendTriggeredEmail(dto: SendTriggeredEmailDto): Promise<{ entryId?: string }> {
    let appendHtml = '';
    let entryId: string | undefined;
    // A form send names the specific form (e.g. "Medication Authentication
    // form email sent") instead of the generic title -- there's no fixed
    // "the" form the way there's one registration flow, so the generic
    // title alone wouldn't say which of possibly several forms was sent.
    const titles =
      dto.trigger === EmailTrigger.FORM && dto.formName
        ? { sent: `${dto.formName} form email sent`, read: `${dto.formName} form email read` }
        : TRIGGERED_EMAIL_TITLES[dto.trigger];
    if (dto.customerId && titles) {
      const entry = await this.auditLogService.record(
        dto.customerId,
        AuditEventType.REGISTRATION_EMAIL_SENT,
        titles.sent,
        undefined,
        undefined,
        'Staff',
        undefined,
        titles.read,
      );
      if (entry) {
        entryId = (entry._id as { toString(): string }).toString();
        appendHtml = trackingPixelHtml(`${publicApiUrl()}/audit-log/${entryId}/pixel.gif`);
      }
    }
    await this.sendTemplatedEmail(
      dto.trigger,
      dto.to,
      { name: dto.name, link: dto.link },
      {},
      appendHtml,
    );
    return { entryId };
  }

  /**
   * Renders the template configured for `trigger` against `vars` (escaped
   * individually into the body) plus `rawVars` (inserted as-is, unescaped --
   * for values that are themselves already HTML, like {{logo}} or
   * {{items_table}}) and sends it. Shared by sendTriggeredEmail above (the
   * registration/update_info/add_pet "copy link or send email" triggers) and
   * InvoicesService/QuotesService's "Send" action.
   */
  async sendTemplatedEmail(
    trigger: EmailTrigger,
    to: string,
    vars: Record<string, string | undefined>,
    rawVars: Record<string, string> = {},
    appendHtml = '',
  ): Promise<void> {
    const template = await this.emailTemplateModel.findOne({ trigger }).exec();
    if (!template) {
      throw new BadRequestException(
        `No email template is set up for this yet -- add one in Settings > Email Templates first.`,
      );
    }
    const business = await this.getBusinessInfo();
    const allVars: Record<string, string | undefined> = {
      businessName: business.name,
      businessAddress: business.address,
      businessTown: business.town,
      businessPostcode: business.postcode,
      businessTelephone: business.telephone,
      businessEmail: business.email,
      businessWebsite: business.website,
      ...vars,
    };
    // References the real, publicly-servable logo URL rather than embedding
    // the stored data: URI directly -- Gmail and other mail clients strip
    // data: URIs from received email HTML, which silently breaks the logo
    // despite it always looking fine in every in-app preview (those render
    // in the browser, which has no such restriction).
    const logoTag = business.logoImage
      ? `<img src="${publicApiUrl()}/settings/business/logo" alt="${escapeHtml(business.name)}" style="max-height:60px;max-width:220px;display:block;" />`
      : '';
    const allRawVars = { logo: logoTag, ...rawVars };

    // invoice/quote templates are edited as raw HTML in the admin (a rich-text
    // editor, not a plain textarea) -- their body is sent through as-is aside
    // from placeholder substitution. Every other trigger's body is staff-authored
    // plain text, so it's escaped and newlines become <br> the same way it
    // always has.
    const htmlBody =
      trigger === EmailTrigger.INVOICE || trigger === EmailTrigger.QUOTE;
    const subject = interpolateSubject(template.subject, allVars);
    // appendHtml (currently just the tracking pixel) isn't a placeholder --
    // it's always added regardless of what the staff-authored template does
    // or doesn't reference, so it can't be silently lost by editing the body.
    const body =
      interpolateBody(template.body, allVars, allRawVars, htmlBody) +
      appendHtml;

    const settings = await this.getSendableSettings();
    const token = await this.getAccessToken(
      settings.tenantId,
      settings.clientId,
      settings.clientSecret,
    );
    await this.graphSendMail(
      settings.fromAddress,
      token,
      to,
      subject,
      body,
      'HTML',
    );
  }
}

// Strips {{#if field}}...{{/if}} blocks whose field is falsy/empty, keeping
// the inner content (with the tags removed) for truthy ones -- used by both
// interpolateSubject and interpolateBody, on the raw template text.
function stripConditionals(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return template.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, inner) => (vars[key] ? inner : ''),
  );
}

function interpolateSubject(
  template: string,
  vars: Record<string, string | undefined>,
): string {
  return stripConditionals(template, vars).replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => vars[key] ?? '',
  );
}

function interpolateBody(
  template: string,
  vars: Record<string, string | undefined>,
  rawVars: Record<string, string>,
  htmlBody: boolean,
): string {
  let working = htmlBody ? template : escapeHtml(template);
  working = stripConditionals(working, vars);
  working = working.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in rawVars ? rawVars[key] : escapeHtml(vars[key] ?? ''),
  );
  return htmlBody ? working : working.replace(/\n/g, '<br>');
}
