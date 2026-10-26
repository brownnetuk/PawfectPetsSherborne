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
import { AddPortalUserDto, UpdateMeDto } from './dto/portal-auth.dto';
import {
  emailRegex,
  findActivePortalAccount,
  isObjectId,
  PortalAccount,
  portalTokenPayload,
  replaceAccountCreds,
  setAccountCreds,
} from './portal-account';
import { lastThreeDigits } from './portal-web-login.service';
import { PortalCreateAnimalDto } from './dto/portal-animal.dto';

// First-time-login and password-reset codes are valid for 48 hours.
const CODE_TTL_MS = 48 * 60 * 60 * 1000;
// Wrong mobile-digit guesses an additional user gets against one code before
// it's thrown away (they then request a new one).
export const APP_PHONE_MAX_ATTEMPTS = 3;
// Lets the app tell "ask for the mobile digits" apart from other errors.
export const PHONE_DIGITS_REQUIRED = 'PHONE_DIGITS_REQUIRED';

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

  sendMessage(customerId: string, body: string, portalUserId?: string) {
    return this.messages.customerSend(customerId, body, portalUserId);
  }

  deleteMessage(customerId: string, messageId: string) {
    return this.messages.customerDelete(customerId, messageId);
  }

  // The customer app registers its APNs device token here (tagged with the
  // customer id so sends route to the customer topic).
  // An additional user's devices are also tagged with their id, so removing
  // their access can drop exactly their tokens.
  async registerPush(
    customerId: string,
    token: string,
    platform = 'ios',
    portalUserId?: string,
  ): Promise<void> {
    await this.push.registerToken(token, platform, {
      customer: customerId,
      portalUser: portalUserId,
    });
  }

  private findActiveAccount(email: string): Promise<PortalAccount | null> {
    return findActivePortalAccount(this.customerModel, email);
  }

  private sign(account: PortalAccount): string {
    return this.jwt.sign(portalTokenPayload(account), {
      secret: portalJwtSecret(this.config.getOrThrow<string>('JWT_SECRET')),
      expiresIn: PORTAL_TOKEN_TTL,
    });
  }

  private static genCode(): string {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  }

  // Generates a fresh code into the right slot and emails it (shared by the
  // public request-code/reset endpoints and the staff-triggered resets).
  private async issueCode(
    account: PortalAccount,
    kind: 'login' | 'reset',
  ): Promise<void> {
    const code = PortalService.genCode();
    const hash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await setAccountCreds(
      this.customerModel,
      account,
      kind === 'login'
        ? {
            loginCodeHash: hash,
            loginCodeExpiresAt: expiresAt,
            phoneAttempts: 0,
          }
        : {
            resetCodeHash: hash,
            resetCodeExpiresAt: expiresAt,
            phoneAttempts: 0,
          },
    );

    const trigger =
      kind === 'login'
        ? EmailTrigger.PORTAL_LOGIN_CODE
        : EmailTrigger.PORTAL_PASSWORD_RESET;
    await this.settings.sendTemplatedEmail(trigger, account.email, {
      customer_name: account.name,
      code,
    });
  }

  // Issues a fresh code and emails it. `kind` picks which slot/template to use.
  // Always resolves quietly (even for unknown/disabled emails) so the endpoint
  // can't be used to probe which addresses have portal access.
  async requestCode(email: string, kind: 'login' | 'reset'): Promise<void> {
    const account = await this.findActiveAccount(email);
    if (!account) return;
    await this.issueCode(account, kind);
  }

  // --- staff-triggered (PortalAdminController, behind the staff guard) ---

  // Toggles a customer's portal access on/off. Turning it off also blocks
  // login (login checks portalActive).
  async setPortalActive(customerId: string, active: boolean) {
    const before = await this.customerModel
      .findById(customerId)
      .select('+portalUsers')
      .exec();
    if (!before)
      throw new NotFoundException(`Customer ${customerId} not found`);
    const wasActive = before.portalActive ?? false;
    before.portalActive = active;
    await before.save();
    // Disabling revokes access immediately: the portal guard re-checks
    // portalActive on every request (so existing sessions 401 and the app logs
    // out), and we drop their device tokens so no more pushes reach them.
    if (!active && wasActive) {
      await this.push.removeCustomerTokens(customerId);
    }
    // Email the customer (and any additional users) when access is switched
    // on (best-effort — a missing PORTAL_ENABLED template mustn't block the
    // toggle).
    if (active && !wasActive) {
      if (before.email) await this.sendWelcome(before.email, before.name ?? '');
      for (const user of before.portalUsers ?? []) {
        await this.sendWelcome(user.email, user.name);
      }
    }
    return { portalActive: active };
  }

  private async sendWelcome(email: string, name: string): Promise<void> {
    try {
      await this.settings.sendTemplatedEmail(
        EmailTrigger.PORTAL_ENABLED,
        email,
        {
          customer_name: name,
        },
      );
    } catch (err) {
      console.error(`Failed to send portal-enabled email to ${email}:`, err);
    }
  }

  // --- additional users (Mobile App Access > "Add additional access") ---

  // Adds a person with the same app access as the customer. Their email must
  // not already sign in to any account (customer or additional user), or the
  // sign-in lookup would be ambiguous. If access is already on they're sent
  // the welcome email straight away.
  async addPortalUser(customerId: string, dto: AddPortalUserDto) {
    const customer = await this.customerModel
      .findById(customerId)
      .select('+portalUsers')
      .exec();
    if (!customer)
      throw new NotFoundException(`Customer ${customerId} not found`);
    const name = dto.name.trim();
    const email = dto.email.trim();
    const phoneNumber = dto.phoneNumber.trim();
    if (!name) throw new BadRequestException('Enter a name.');
    if (!lastThreeDigits(phoneNumber)) {
      throw new BadRequestException(
        'Enter a mobile number -- it is used to verify this person when they sign in.',
      );
    }
    const re = emailRegex(email);
    const clash = await this.customerModel
      .findOne({ $or: [{ email: re }, { 'portalUsers.email': re }] })
      .select('name')
      .lean()
      .exec();
    if (clash) {
      throw new BadRequestException(
        String(clash._id) === customerId
          ? 'That email address already has access to this customer.'
          : `That email address is already used by another customer (${clash.name}), so it can't sign in here too.`,
      );
    }
    await this.customerModel
      .updateOne(
        { _id: customer._id },
        {
          $push: { portalUsers: { name, email, phoneNumber, credentials: {} } },
        },
      )
      .exec();
    if (customer.portalActive) await this.sendWelcome(email, name);
    return this.getPortalStatus(customerId);
  }

  // Removes an additional user: their sessions stop working on their next
  // request (the portal guard checks they're still listed) and their devices
  // stop getting this customer's pushes.
  async removePortalUser(customerId: string, userId: string) {
    if (!isObjectId(userId)) throw new NotFoundException('User not found');
    const res = await this.customerModel
      .updateOne(
        { _id: customerId, 'portalUsers._id': userId },
        { $pull: { portalUsers: { _id: userId } } },
      )
      .exec();
    if (!res.matchedCount) throw new NotFoundException('User not found');
    await this.push.removePortalUserTokens(userId);
    return this.getPortalStatus(customerId);
  }

  // --- customer-initiated (the app's "Delete my account") ---

  // Deletes the signed-in person's app account. An additional user is removed
  // outright. The customer themselves has their sign-in deleted and app access
  // switched off for the whole account (so any additional users lose it too);
  // every session then 401s on its next request and all devices stop getting
  // pushes. The customer record itself is the business's (bookings, invoices),
  // so staff are told and, when `eraseData` is set, asked to erase it.
  async deleteAppAccount(
    customerId: string,
    portalUserId: string | undefined,
    eraseData: boolean,
  ): Promise<void> {
    const customer = await this.customerModel
      .findById(customerId)
      .select('+portalUsers')
      .exec();
    if (!customer) throw new UnauthorizedException();
    let who = customer.name || 'A customer';
    if (portalUserId) {
      const user = customer.portalUsers?.find(
        (u) => String(u._id) === portalUserId,
      );
      if (user) who = `${user.name} (additional user for ${customer.name})`;
      await this.customerModel
        .updateOne(
          { _id: customer._id },
          { $pull: { portalUsers: { _id: portalUserId } } },
        )
        .exec();
      await this.push.removePortalUserTokens(portalUserId);
    } else {
      await this.customerModel
        .updateOne(
          { _id: customer._id },
          {
            $set: { portalActive: false },
            $unset: { portalCredentials: '', portalLastLoginAt: '' },
          },
        )
        .exec();
      await this.push.removeCustomerTokens(customerId);
    }
    try {
      await this.notifications.dispatch(
        eraseData ? 'Data erasure requested' : 'App account deleted',
        eraseData
          ? `${who} deleted their app account and asked for their personal data to be erased.`
          : `${who} deleted their app account.`,
        'portalAccountDeleted',
      );
    } catch (err) {
      console.error('Failed to notify staff of app account deletion:', err);
    }
  }

  // Staff "Password reset" for an additional user: emails them a reset code.
  async adminSendUserReset(customerId: string, userId: string) {
    const customer = await this.customerModel
      .findById(customerId)
      .select('+portalUsers')
      .exec();
    if (!customer)
      throw new NotFoundException(`Customer ${customerId} not found`);
    const user = customer.portalUsers?.find((u) => String(u._id) === userId);
    if (!user) throw new NotFoundException('User not found');
    if (!customer.portalActive) {
      throw new BadRequestException(
        'Enable the portal for this customer before sending a reset.',
      );
    }
    await this.issueCode(
      {
        customer,
        user,
        email: user.email,
        name: user.name,
        phoneNumber: user.phoneNumber,
        creds: user.credentials ?? {},
      },
      'reset',
    );
    return { ok: true };
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
    await this.issueCode(
      {
        customer,
        email: customer.email,
        name: customer.name ?? '',
        phoneNumber: customer.phoneNumber,
        creds: customer.portalCredentials ?? {},
      },
      'reset',
    );
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
    creds: PortalAccount['creds'] | undefined,
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
  // Tells the app whether this account will also need the last 3 digits of
  // their mobile (additional users only).
  async verifyCode(
    email: string,
    code: string,
  ): Promise<{ phoneDigitsRequired: boolean }> {
    const account = await this.findActiveAccount(email);
    if (!account || !(await PortalService.matchCode(account.creds, code))) {
      throw new UnauthorizedException('Invalid or expired code.');
    }
    return { phoneDigitsRequired: !!account.user };
  }

  // Consumes a valid code, sets the password, and logs the customer in. An
  // additional user must also give the last 3 digits of the mobile number
  // staff recorded for them -- that's what ties the emailed code to the person
  // staff actually added.
  async setPassword(
    email: string,
    code: string,
    password: string,
    digits?: string,
  ): Promise<{ token: string }> {
    const account = await this.findActiveAccount(email);
    if (!account || !(await PortalService.matchCode(account.creds, code))) {
      throw new UnauthorizedException('Invalid or expired code.');
    }
    if (account.user) await this.checkPhoneDigits(account, digits);
    // Replace the whole sub-doc so both codes are dropped (single-use) and only
    // the new password hash remains.
    await replaceAccountCreds(
      this.customerModel,
      account,
      { passwordHash: await bcrypt.hash(password, 10) },
      { touchLogin: true },
    );
    return { token: this.sign(account) };
  }

  private async checkPhoneDigits(
    account: PortalAccount,
    digits: string | undefined,
  ): Promise<void> {
    const expected = lastThreeDigits(account.phoneNumber);
    if (!expected) {
      throw new BadRequestException(
        "We don't have a mobile number on file for you, so we can't finish setting up your login. Please get in touch with us.",
      );
    }
    if (!digits) {
      throw new BadRequestException({
        statusCode: 400,
        code: PHONE_DIGITS_REQUIRED,
        message: 'Enter the last 3 digits of your mobile number.',
      });
    }
    if (digits === expected) return;
    const attempts = (account.creds.phoneAttempts ?? 0) + 1;
    if (attempts >= APP_PHONE_MAX_ATTEMPTS) {
      // Burn the codes: they have to request a fresh one.
      await setAccountCreds(this.customerModel, account, {
        loginCodeHash: undefined,
        loginCodeExpiresAt: undefined,
        resetCodeHash: undefined,
        resetCodeExpiresAt: undefined,
        phoneAttempts: undefined,
      });
      // 400 not 401, so the app shows this message rather than treating it
      // as an expired session.
      throw new BadRequestException(
        "Those digits don't match the number we have. Please request a new code.",
      );
    }
    await setAccountCreds(this.customerModel, account, {
      phoneAttempts: attempts,
    });
    throw new BadRequestException({
      statusCode: 400,
      code: PHONE_DIGITS_REQUIRED,
      message: "Those digits don't match the mobile number we have for you.",
    });
  }

  async login(email: string, password: string): Promise<{ token: string }> {
    const account = await this.findActiveAccount(email);
    const hash = account?.creds.passwordHash;
    if (!account || !hash || !(await bcrypt.compare(password, hash))) {
      throw new UnauthorizedException('Incorrect email or password.');
    }
    await setAccountCreds(
      this.customerModel,
      account,
      {},
      { touchLogin: true },
    );
    return { token: this.sign(account) };
  }

  // Login/usage status for the admin's Mobile App Access card. Stateless JWT
  // means "still logged in" can't be known for certain -- setUp + lastLoginAt +
  // a registered device (with its last-seen) are the honest signals.
  async getPortalStatus(customerId: string) {
    const customer = await this.customerModel
      .findById(customerId)
      .select(
        '+portalCredentials +portalUsers email portalActive portalLastLoginAt',
      )
      .exec();
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);
    const devices = await this.push.customerTokenStats(customerId);
    return {
      portalActive: customer.portalActive ?? false,
      // The email the customer's own access is granted for.
      email: customer.email,
      setUp: !!customer.portalCredentials?.passwordHash,
      lastLoginAt: customer.portalLastLoginAt ?? null,
      deviceCount: devices.count,
      lastDeviceAt: devices.lastAt,
      // Never the credentials themselves -- just whether they've set up.
      additionalUsers: (customer.portalUsers ?? []).map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        phoneNumber: u.phoneNumber,
        setUp: !!u.credentials?.passwordHash,
        lastLoginAt: u.lastLoginAt ?? null,
        addedAt: u.createdAt ?? null,
      })),
    };
  }

  // The curated profile the app shows on "My Details" and its sub-sections.
  // Never includes credentials (loaded without the hidden sub-doc) nor the
  // decrypted alarm instructions (only whether some are on file). Bundles the
  // business's current terms so the read-only Agreement screen can render them.
  // `portalUserId` is set when an additional user is signed in; the profile is
  // still the customer's, but `viewer` says who is actually looking at it.
  async getProfile(customerId: string, portalUserId?: string) {
    const c = await this.customerModel
      .findById(customerId)
      .select('+portalUsers')
      .exec();
    if (!c) throw new UnauthorizedException();
    const ec = c.emergencyContact;
    const ev = c.emergencyVet;
    const business = await this.settings.getBusinessInfo();
    const portalUser = portalUserId
      ? c.portalUsers?.find((u) => String(u._id) === portalUserId)
      : undefined;
    return {
      id: c._id?.toString(),
      // Who is signed in: the customer themselves (portalUserId null) or an
      // additional user. The app uses this to label its own messages "You".
      viewer: portalUser
        ? { portalUserId: String(portalUser._id), name: portalUser.name }
        : { portalUserId: null, name: c.name },
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
  async updateProfile(
    customerId: string,
    dto: UpdateMeDto,
    portalUserId?: string,
  ) {
    await this.customers.update(
      customerId,
      dto as UpdateCustomerDto,
      'Customer (portal)',
    );
    const updated = await this.getProfile(customerId, portalUserId);
    await this.notifications.notifyCustomerUpdated(updated.name);
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

  async quotePdf(customerId: string, id: string): Promise<Buffer> {
    const quote = await this.quotes.findOne(id);
    this.assertOwnership(quote, customerId);
    return this.quotes.renderPdf(id);
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
      .populate('additionalAnimals', 'name')
      .populate('product', 'name')
      .exec();
  }

  // --- animals (the customer's own pets) ---

  listAnimals(customerId: string) {
    return this.animals.findAll(customerId);
  }

  // Creates a pet owned by the authenticated customer (the customer id is
  // forced here, never taken from the request body).
  async createAnimal(customerId: string, dto: PortalCreateAnimalDto) {
    const animal = await this.animals.create(
      { ...dto, customer: customerId },
      'Customer (portal)',
    );
    await this.notifications.notifyCustomerPet(
      await this.customerName(customerId),
      animal.name,
      'added',
    );
    return animal;
  }

  // Ownership is enforced inside updateForCustomer (matches the animal's own
  // customer field), so a customer can only edit their own pets.
  async updateAnimal(customerId: string, id: string, dto: PublicUpdateAnimalDto) {
    const animal = await this.animals.updateForCustomer(id, customerId, dto, 'Customer (portal)');
    await this.notifications.notifyCustomerPet(
      await this.customerName(customerId),
      animal.name,
      'updated',
    );
    return animal;
  }

  private async customerName(customerId: string): Promise<string | undefined> {
    const c = await this.customerModel.findById(customerId).select('name').lean().exec();
    return c?.name;
  }
}
