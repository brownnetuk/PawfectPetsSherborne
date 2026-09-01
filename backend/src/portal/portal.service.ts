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
import { DayBooking } from '../day-bookings/schemas/day-booking.schema';
import { NotificationService } from '../notifications/notification.service';
import { PushService } from '../push/push.service';
import { SettingsService } from '../settings/settings.service';
import { EmailTrigger } from '../settings/schemas/email-template.schema';
import { portalJwtSecret, PORTAL_TOKEN_TTL } from './portal-jwt.util';
import { UpdateMeDto } from './dto/portal-auth.dto';

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
    private readonly notifications: NotificationService,
    private readonly push: PushService,
  ) {}

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
    const customer = await this.customerModel
      .findByIdAndUpdate(customerId, { portalActive: active }, { new: true })
      .exec();
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);
    return { portalActive: customer.portalActive ?? false };
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

  // The curated profile the app shows on "Customer Details". Never includes
  // credentials (loaded without the hidden sub-doc).
  async getProfile(customerId: string) {
    const c = await this.customerModel.findById(customerId).exec();
    if (!c) throw new UnauthorizedException();
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
}
