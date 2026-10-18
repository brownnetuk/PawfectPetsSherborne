import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Customer } from '../customers/schemas/customer.schema';
import {
  EmailTemplate,
  EmailTrigger,
} from '../settings/schemas/email-template.schema';
import { SettingsService } from '../settings/settings.service';
import { portalJwtSecret, PORTAL_WEB_TOKEN_TTL } from './portal-jwt.util';

// The emailed code only needs to survive the trip to the inbox and back.
export const WEB_CODE_TTL_MS = 10 * 60 * 1000;
// Time allowed between a correct code and the phone-digit check.
export const WEB_STEP_TTL_MS = 10 * 60 * 1000;
// Wrong guesses allowed before that code / step is thrown away and the
// customer has to start again from their email address. Per account, on top
// of the per-IP @Throttle limits on the routes.
export const WEB_CODE_MAX_ATTEMPTS = 5;
export const WEB_STEP_MAX_ATTEMPTS = 3;

const DEFAULT_SUBJECT = 'Your {{businessName}} sign-in code';
const DEFAULT_BODY = `<div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;">
<div style="padding:8px 0 20px;">{{logo}}<strong style="font-size:1.15rem;">{{businessName}}</strong></div>
<p style="margin:0 0 16px;">Hi {{customer_name}},</p>
<p style="margin:0 0 16px;">Here is your code to sign in to the {{businessName}} customer portal:</p>
<p style="margin:0 0 24px;font-size:2rem;font-weight:700;letter-spacing:0.3em;">{{code}}</p>
<p style="margin:0 0 16px;">It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.</p>
<p style="margin:0 0 16px;">Thanks,<br>{{businessName}}</p>
<p style="margin:24px 0 0;color:#6b7280;font-size:0.85rem;">{{businessName}} · {{businessAddress}}, {{businessTown}} {{businessPostcode}} · {{businessTelephone}}</p>
</div>`;

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

// The last 3 digits of a phone number, ignoring spaces/+/brackets etc.
// Undefined when there aren't at least 3 digits on file.
export function lastThreeDigits(phone: string | undefined): string | undefined {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 3 ? digits.slice(-3) : undefined;
}

// Two-step sign-in for the browser customer portal (portal/ app):
//   1. email -> a 6-digit code is emailed (requestCode)
//   2. email + code -> a one-time step token (verifyCode)
//   3. email + step token + last 3 digits of their mobile -> portal JWT
// It lives in the same realm as the customer app (same portalActive switch,
// same signing secret, same /portal/* data routes) but uses its own code
// slots, so it never disturbs the app's password set-up/reset codes.
@Injectable()
export class PortalWebLoginService implements OnModuleInit {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(EmailTemplate.name)
    private readonly emailTemplateModel: Model<EmailTemplate>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  // Seeds the sign-in email template once, so the portal works out of the
  // box -- staff can still edit it in Settings > Email Templates.
  async onModuleInit() {
    try {
      await this.emailTemplateModel
        .updateOne(
          { trigger: EmailTrigger.PORTAL_WEB_LOGIN_CODE },
          {
            $setOnInsert: {
              trigger: EmailTrigger.PORTAL_WEB_LOGIN_CODE,
              name: 'Customer Portal Sign-in Code',
              subject: DEFAULT_SUBJECT,
              body: DEFAULT_BODY,
            },
          },
          { upsert: true },
        )
        .exec();
    } catch {
      // Not fatal: staff can still set the template up by hand.
    }
  }

  private async findActiveWithCreds(email: string): Promise<Customer | null> {
    const escaped = email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.customerModel
      .findOne({ email: new RegExp(`^${escaped}$`, 'i'), portalActive: true })
      .select('+portalCredentials')
      .exec();
  }

  private async setCreds(
    customer: Customer,
    fields: Record<string, unknown>,
  ): Promise<void> {
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) unset[`portalCredentials.${key}`] = '';
      else set[`portalCredentials.${key}`] = value;
    }
    const update: Record<string, unknown> = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    await this.customerModel.updateOne({ _id: customer._id }, update).exec();
  }

  // Always resolves quietly, so the endpoint can't be used to find out which
  // addresses have portal access.
  async requestCode(email: string): Promise<void> {
    const customer = await this.findActiveWithCreds(email);
    if (!customer?.email) return;
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await this.setCreds(customer, {
      webCodeHash: await bcrypt.hash(code, 10),
      webCodeExpiresAt: new Date(Date.now() + WEB_CODE_TTL_MS),
      webCodeAttempts: 0,
      // A new code restarts the whole sign-in.
      webStepHash: undefined,
      webStepExpiresAt: undefined,
      webStepAttempts: undefined,
    });
    await this.settings.sendTemplatedEmail(
      EmailTrigger.PORTAL_WEB_LOGIN_CODE,
      customer.email,
      { customer_name: customer.name ?? '', code },
    );
  }

  async verifyCode(
    email: string,
    code: string,
  ): Promise<{ stepToken: string }> {
    const invalid = new UnauthorizedException('Invalid or expired code.');
    const customer = await this.findActiveWithCreds(email);
    const creds = customer?.portalCredentials;
    if (
      !customer ||
      !creds?.webCodeHash ||
      !creds.webCodeExpiresAt ||
      creds.webCodeExpiresAt.getTime() < Date.now()
    ) {
      throw invalid;
    }
    if (!(await bcrypt.compare(code, creds.webCodeHash))) {
      const attempts = (creds.webCodeAttempts ?? 0) + 1;
      await this.setCreds(
        customer,
        attempts >= WEB_CODE_MAX_ATTEMPTS
          ? {
              webCodeHash: undefined,
              webCodeExpiresAt: undefined,
              webCodeAttempts: undefined,
            }
          : { webCodeAttempts: attempts },
      );
      throw invalid;
    }
    if (!lastThreeDigits(customer.phoneNumber)) {
      throw new BadRequestException(
        "We don't have a mobile number on file for you, so we can't finish signing you in. Please get in touch with us.",
      );
    }
    const stepToken = crypto.randomBytes(32).toString('hex');
    await this.setCreds(customer, {
      // The code is single-use.
      webCodeHash: undefined,
      webCodeExpiresAt: undefined,
      webCodeAttempts: undefined,
      webStepHash: sha256(stepToken),
      webStepExpiresAt: new Date(Date.now() + WEB_STEP_TTL_MS),
      webStepAttempts: 0,
    });
    return { stepToken };
  }

  async verifyPhone(
    email: string,
    stepToken: string,
    digits: string,
  ): Promise<{ token: string }> {
    const expired = new UnauthorizedException(
      'Your sign-in has expired. Please start again.',
    );
    const customer = await this.findActiveWithCreds(email);
    const creds = customer?.portalCredentials;
    if (
      !customer ||
      !creds?.webStepHash ||
      !creds.webStepExpiresAt ||
      creds.webStepExpiresAt.getTime() < Date.now() ||
      !crypto.timingSafeEqual(
        Buffer.from(sha256(stepToken)),
        Buffer.from(creds.webStepHash),
      )
    ) {
      throw expired;
    }
    const expected = lastThreeDigits(customer.phoneNumber);
    if (!expected || digits !== expected) {
      const attempts = (creds.webStepAttempts ?? 0) + 1;
      if (attempts >= WEB_STEP_MAX_ATTEMPTS) {
        await this.setCreds(customer, {
          webStepHash: undefined,
          webStepExpiresAt: undefined,
          webStepAttempts: undefined,
        });
        throw new UnauthorizedException(
          "Those digits don't match the number we have. Please start again.",
        );
      }
      await this.setCreds(customer, { webStepAttempts: attempts });
      throw new UnauthorizedException(
        "Those digits don't match the mobile number we have for you.",
      );
    }
    await this.customerModel
      .updateOne(
        { _id: customer._id },
        {
          $set: { portalLastLoginAt: new Date() },
          $unset: {
            'portalCredentials.webStepHash': '',
            'portalCredentials.webStepExpiresAt': '',
            'portalCredentials.webStepAttempts': '',
          },
        },
      )
      .exec();
    const token = this.jwt.sign(
      { sub: customer._id?.toString(), email: customer.email, typ: 'portal' },
      {
        secret: portalJwtSecret(this.config.getOrThrow<string>('JWT_SECRET')),
        expiresIn: PORTAL_WEB_TOKEN_TTL,
      },
    );
    return { token };
  }
}
