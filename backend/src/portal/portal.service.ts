import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Customer } from '../customers/schemas/customer.schema';
import { CustomersService } from '../customers/customers.service';
import { UpdateCustomerDto } from '../customers/dto/update-customer.dto';
import { InvoicesService } from '../invoices/invoices.service';
import { QuotesService } from '../quotes/quotes.service';
import { AnimalsService } from '../animals/animals.service';
import { PublicUpdateAnimalDto } from '../animals/dto/public-update-animal.dto';
import { DayBooking } from '../day-bookings/schemas/day-booking.schema';
import { NotificationService } from '../notifications/notification.service';
import { PushService } from '../push/push.service';
import { MessagesService } from '../messages/messages.service';
import { CustomerNotificationsService } from '../customer-notifications/customer-notifications.service';
import { PushMessagesService } from '../push-messages/push-messages.service';
import { SettingsService } from '../settings/settings.service';
import { EmailTrigger } from '../settings/schemas/email-template.schema';
import { portalJwtSecret, PORTAL_TOKEN_TTL } from './portal-jwt.util';
import { UpdateMeDto } from './dto/portal-auth.dto';
import { PortalCreateAnimalDto } from './dto/portal-animal.dto';

// First-time-login and password-reset codes are valid for 48 hours.
const CODE_TTL_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class PortalService {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(DayBooking.name)
    private readonly dayBookingModel: Model<DayBooking>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly customers: CustomersService,
    private readonly invoices: InvoicesService,
    private readonly quotes: QuotesService,
    private readonly animals: AnimalsService,
    private readonly notifications: NotificationService,
    private readonly push: PushService,
    private readonly messages: MessagesService,
    private readonly customerNotifications: CustomerNotificationsService,
    private readonly pushMessages: PushMessagesService,
  ) {}

  // A broadcast push-message the customer is acknowledging from the app.
  acknowledgePushMessage(customerId: string, pushMessageId: string) {
    return this.pushMessages.acknowledge(pushMessageId, customerId);
  }

  // --- notifications (the customer app's bell feed) ---

  listNotifications(customerId: string) {
    return this.customerNotifications.list(customerId);
  }

  async notificationsUnread(customerId: string) {
    return { count: await this.customerNotifications.unread(customerId) };
  }

  markNotificationsRead(customerId: string) {
    return this.customerNotifications.markAllRead(customerId);
  }

  // --- messages (customer side of the staff <-> customer thread) ---

  messagesThread(customerId: string) {
    return this.messages.openThreadAsCustomer(customerId);
  }

  async messagesUnread(customerId: string) {
    return { count: await this.messages.customerUnread(customerId) };
  }

  sendMessage(customerId: string, body: string) {
    return this.messages.customerSend(customerId, body);
  }

  deleteMessage(customerId: string, messageId: string) {
    return this.messages.customerDelete(customerId, messageId);
  }

  // The customer app registers its APNs device token here (tagged with the
  // customer id so sends route to the customer topic).
  async registerPush(
    customerId: string,
    token: string,
    platform = 'ios',
  ): Promise<void> {
    await this.push.registerToken(token, platform, { customer: customerId });
  }

  // Case-insensitive lookup of a portal-enabled customer, with the hidden
  // credentials sub-doc loaded. Returns null when no such active customer.
  private async findActiveWithCreds(email: string): Promise<Customer | null> {
    const escaped = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.customerModel
      .findOne({ email: new RegExp(`^${escaped}$`, 'i'), portalActive: true })
      .select('+portalCredentials')
      .exec();
  }

  private sign(customer: Customer): string {
    return this.jwt.sign(
      { sub: customer._id?.toString(), email: customer.email, typ: 'portal' },
      {
        secret: portalJwtSecret(this.config.getOrThrow<string>('JWT_SECRET')),
        expiresIn: PORTAL_TOKEN_TTL,
      },
    );
  }

  private static genCode(): string {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  }

  // Generates a fresh code into the right slot and emails it (shared by the
  // public request-code/reset endpoints and the staff-triggered reset). The
  // customer must have been loaded with `+portalCredentials`.
  private async issueCode(
    customer: Customer,
    kind: 'login' | 'reset',
  ): Promise<void> {
    const code = PortalService.genCode();
    const hash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    const creds = customer.portalCredentials ?? {};
    if (kind === 'login') {
      creds.loginCodeHash = hash;
      creds.loginCodeExpiresAt = expiresAt;
    } else {
      creds.resetCodeHash = hash;
      creds.resetCodeExpiresAt = expiresAt;
    }
    customer.portalCredentials = creds;
    await customer.save();

    const trigger =
      kind === 'login'
        ? EmailTrigger.PORTAL_LOGIN_CODE
        : EmailTrigger.PORTAL_PASSWORD_RESET;
    await this.settings.sendTemplatedEmail(trigger, customer.email, {
      customer_name: customer.name ?? '',
      code,
    });
  }

  // Issues a fresh code and emails it. `kind` picks which slot/template to use.
  // Always resolves quietly (even for unknown/disabled emails) so the endpoint
  // can't be used to probe which addresses have portal access.
  async requestCode(email: string, kind: 'login' | 'reset'): Promise<void> {
    const customer = await this.findActiveWithCreds(email);
    if (!customer) return;
    await this.issueCode(customer, kind);
  }

  // --- staff-triggered (PortalAdminController, behind the staff guard) ---

  // Toggles a customer's portal access on/off. Turning it off also blocks
  // login (login checks portalActive).
  async setPortalActive(customerId: string, active: boolean) {
    const before = await this.customerModel.findById(customerId).exec();
    if (!before) throw new NotFoundException(`Customer ${customerId} not found`);
    const wasActive = before.portalActive ?? false;
    before.portalActive = active;
    await before.save();
    // Disabling revokes access immediately: the portal guard re-checks
    // portalActive on every request (so existing sessions 401 and the app logs
    // out), and we drop their device tokens so no more pushes reach them.
    if (!active && wasActive) {
      await this.push.removeCustomerTokens(customerId);
    }
    // Email the customer the first time access is switched on (best-effort —
    // a missing PORTAL_ENABLED template mustn't block the toggle).
    if (active && !wasActive && before.email) {
      try {
        await this.settings.sendTemplatedEmail(
          EmailTrigger.PORTAL_ENABLED,
          before.email,
          { customer_name: before.name ?? '' },
        );
      } catch (err) {
        console.error(`Failed to send portal-enabled email to ${before.email}:`, err);
      }
    }
    return { portalActive: active };
  }

  // Staff "Password reset" button: emails this customer a reset code.
  async adminSendReset(customerId: string) {
    const customer = await this.customerModel
      .findById(customerId)
      .select('+portalCredentials')
      .exec();
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);
    if (!customer.portalActive) {
      throw new BadRequestException(
        'Enable the portal for this customer before sending a reset.',
      );
    }
    if (!customer.email) {
      throw new BadRequestException('This customer has no email address on file.');
    }
    await this.issueCode(customer, 'reset');
    return { ok: true };
  }

  // Staff "send test push" button: pushes a free-text message to this
  // customer's device(s). Returns the delivery summary so the admin can see
  // whether anything was reached (and diagnose config/registration issues).
  async adminSendTestPush(customerId: string, message?: string) {
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);
    const text = (message ?? '').trim() || 'This is a test notification from Pawfect Pets.';
    // Records to the customer's bell feed and pushes; returns the push summary.
    const result = await this.customerNotifications.record(
      customerId,
      'Pawfect Pets',
      text,
      'test',
    );
    return {
      ...result,
      // Surface whether the customer APNs topic is even configured, so a 0/0
      // result is easy to interpret.
      customerPushConfigured: this.push.diagnostics.keyParsed &&
        !!this.push.diagnostics.customerBundleId,
    };
  }

  // Validates a code against either slot (login or reset), honouring expiry.
  private static async matchCode(
    creds: Customer['portalCredentials'],
    code: string,
  ): Promise<boolean> {
    if (!creds) return false;
    const now = Date.now();
    const candidates: Array<[string | undefined, Date | undefined]> = [
      [creds.loginCodeHash, creds.loginCodeExpiresAt],
      [creds.resetCodeHash, creds.resetCodeExpiresAt],
    ];
    for (const [hash, expiresAt] of candidates) {
      if (!hash || !expiresAt || expiresAt.getTime() < now) continue;
      if (await bcrypt.compare(code, hash)) return true;
    }
    return false;
  }

  // Pre-check used by the app before showing the "set a password" screen.
  async verifyCode(email: string, code: string): Promise<void> {
    const customer = await this.findActiveWithCreds(email);
    if (!customer || !(await PortalService.matchCode(customer.portalCredentials, code))) {
      throw new UnauthorizedException('Invalid or expired code.');
    }
  }

  // Consumes a valid code, sets the password, and logs the customer in.
  async setPassword(
    email: string,
    code: string,
    password: string,
  ): Promise<{ token: string }> {
    const customer = await this.findActiveWithCreds(email);
    if (!customer || !(await PortalService.matchCode(customer.portalCredentials, code))) {
      throw new UnauthorizedException('Invalid or expired code.');
    }
    // Replace the whole sub-doc so both codes are dropped (single-use) and only
    // the new password hash remains.
    customer.portalCredentials = { passwordHash: await bcrypt.hash(password, 10) };
    await customer.save();
    return { token: this.sign(customer) };
  }

  async login(email: string, password: string): Promise<{ token: string }> {
    const customer = await this.findActiveWithCreds(email);
    const hash = customer?.portalCredentials?.passwordHash;
    if (!customer || !hash || !(await bcrypt.compare(password, hash))) {
      throw new UnauthorizedException('Incorrect email or password.');
    }
    return { token: this.sign(customer) };
  }

  // The curated profile the app shows on "My Details" and its sub-sections.
  // Never includes credentials (loaded without the hidden sub-doc) nor the
  // decrypted alarm instructions (only whether some are on file). Bundles the
  // business's current terms so the read-only Agreement screen can render them.
  async getProfile(customerId: string) {
    const c = await this.customerModel.findById(customerId).exec();
    if (!c) throw new UnauthorizedException();
    const ec = c.emergencyContact;
    const ev = c.emergencyVet;
    const business = await this.settings.getBusinessInfo();
    return {
      id: c._id?.toString(),
      firstName: c.firstName,
      surname: c.surname,
      name: c.name,
      email: c.email,
      phoneNumber: c.phoneNumber,
      address1: c.address1,
      address2: c.address2,
      town: c.town,
      county: c.county,
      postcode: c.postcode,
      address: c.address,
      emergencyContact: ec
        ? {
            sameAsClient: ec.sameAsClient ?? false,
            firstName: ec.firstName,
            surname: ec.surname,
            address1: ec.address1,
            address2: ec.address2,
            town: ec.town,
            county: ec.county,
            postcode: ec.postcode,
            phoneNumber: ec.phoneNumber,
            email: ec.email,
          }
        : null,
      emergencyVet: ev
        ? {
            practiceName: ev.practiceName,
            address1: ev.address1,
            address2: ev.address2,
            town: ev.town,
            county: ev.county,
            postcode: ev.postcode,
            telephone: ev.telephone,
            email: ev.email,
          }
        : null,
      security: {
        keysProvided: c.security?.keysProvided ?? false,
        furtherInformation: c.security?.furtherInformation,
        // Never the plaintext — just whether any are on file.
        hasAlarmInstructions: !!c.security?.alarmInstructionsEncrypted,
      },
      agreement: {
        signedName: c.agreement?.signedName,
        signatureImage: c.agreement?.signatureImage,
        signedAt: c.agreement?.signedAt,
        termsVersion: c.agreement?.termsVersion,
        termsDocumentDate: c.agreement?.termsDocumentDate,
      },
      terms: {
        html: business.termsHtml ?? '',
        version: business.termsVersion,
        documentDate: business.termsDocumentDate,
      },
      // Shown on the animal form's off-lead consent step (dogs), where the
      // customer must sign to agree.
      offLeadConsentText: business.offLeadConsentText ?? '',
    };
  }

  // Edits the customer's own contact details via CustomersService (so name/
  // address stay computed and the change is audit-logged), then nudges staff.
  async updateProfile(customerId: string, dto: UpdateMeDto) {
    await this.customers.update(
      customerId,
      dto as UpdateCustomerDto,
      'Customer (portal)',
    );
    const updated = await this.getProfile(customerId);
    await this.notifications.dispatch(
      'Customer updated their details',
      `${updated.name ?? 'A customer'} edited their details in the portal.`,
      'customerUpdated',
    );
    return updated;
  }

  // Confirms a document belongs to this customer before any per-id action.
  private assertOwnership(
    doc: { customer?: unknown } | null,
    customerId: string,
  ): void {
    const owner = doc?.customer as { _id?: unknown } | undefined;
    const ownerId =
      owner?._id != null ? String(owner._id) : owner != null ? String(owner) : null;
    if (!ownerId || ownerId !== customerId) {
      throw new ForbiddenException('Not your record.');
    }
  }

  listInvoices(customerId: string) {
    return this.invoices.findAll(customerId);
  }

  async invoicePdf(customerId: string, id: string): Promise<Buffer> {
    const invoice = await this.invoices.findOne(id);
    this.assertOwnership(invoice, customerId);
    return this.invoices.renderPdf(id);
  }

  async sendInvoice(customerId: string, id: string) {
    const invoice = await this.invoices.findOne(id);
    this.assertOwnership(invoice, customerId);
    await this.invoices.sendEmail(id, 'Customer (portal)');
    return { ok: true };
  }

  listQuotes(customerId: string) {
    return this.quotes.findAll(customerId);
  }

  async acceptQuote(customerId: string, id: string) {
    const quote = await this.quotes.findOne(id);
    this.assertOwnership(quote, customerId);
    const result = await this.quotes.acceptAndConvert(id);
    await this.notifications.dispatch(
      'Quote accepted',
      `${quote.customer && (quote.customer as any).name ? (quote.customer as any).name : 'A customer'} accepted a quote in the portal.`,
      'quoteAccepted',
    );
    return result;
  }

  async declineQuote(customerId: string, id: string) {
    const quote = await this.quotes.findOne(id);
    this.assertOwnership(quote, customerId);
    const result = await this.quotes.reject(id);
    await this.notifications.dispatch(
      'Quote declined',
      `${quote.customer && (quote.customer as any).name ? (quote.customer as any).name : 'A customer'} declined a quote in the portal.`,
      'quoteDeclined',
    );
    return result;
  }

  // The customer's scheduled walks/visits (their animals only — DayBooking's
  // `customer` is denormalized from the animal), most recent first.
  listBookings(customerId: string) {
    return this.dayBookingModel
      .find({ customer: customerId })
      .sort({ date: -1 })
      .populate('animal', 'name')
      .populate('product', 'name')
      .exec();
  }

  // --- animals (the customer's own pets) ---

  listAnimals(customerId: string) {
    return this.animals.findAll(customerId);
  }

  // Creates a pet owned by the authenticated customer (the customer id is
  // forced here, never taken from the request body).
  createAnimal(customerId: string, dto: PortalCreateAnimalDto) {
    return this.animals.create(
      { ...dto, customer: customerId },
      'Customer (portal)',
    );
  }

  // Ownership is enforced inside updateForCustomer (matches the animal's own
  // customer field), so a customer can only edit their own pets.
  updateAnimal(customerId: string, id: string, dto: PublicUpdateAnimalDto) {
    return this.animals.updateForCustomer(id, customerId, dto, 'Customer (portal)');
  }
}
