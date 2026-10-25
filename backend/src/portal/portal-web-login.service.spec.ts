import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { Customer } from '../customers/schemas/customer.schema';
import { EmailTemplate } from '../settings/schemas/email-template.schema';
import { SettingsService } from '../settings/settings.service';
import { portalJwtSecret } from './portal-jwt.util';
import {
  lastThreeDigits,
  PortalWebLoginService,
  WEB_CODE_MAX_ATTEMPTS,
  WEB_STEP_MAX_ATTEMPTS,
} from './portal-web-login.service';

type Creds = Record<string, unknown>;
type User = {
  _id: string;
  name: string;
  email: string;
  phoneNumber: string;
  credentials: Creds;
  lastLoginAt?: Date;
};
type Row = {
  _id: string;
  email: string;
  name: string;
  phoneNumber?: string;
  portalActive: boolean;
  portalCredentials: Creds;
  portalLastLoginAt?: Date;
  portalUsers: User[];
};

// A one-customer stand-in for the Customer model: findOne honours the
// portalActive + $or (customer email / additional-user email) filter, and
// updateOne applies dotted $set/$unset to either the customer's credentials or
// (via the `portalUsers.$` positional path) the matched additional user's.
function fakeCustomerModel(row: Row) {
  const snapshot = () => ({
    ...row,
    portalCredentials: { ...row.portalCredentials },
    portalUsers: row.portalUsers.map((u) => ({
      ...u,
      credentials: { ...u.credentials },
    })),
  });
  const apply = (
    filter: Record<string, unknown>,
    path: string,
    value: unknown,
    unset: boolean,
  ) => {
    let target: Record<string, unknown> = row;
    let rest = path;
    if (path.startsWith('portalUsers.$.')) {
      const user = row.portalUsers.find(
        (u) => u._id === filter['portalUsers._id'],
      );
      if (!user) return;
      target = user;
      rest = path.slice('portalUsers.$.'.length);
    }
    const parts = rest.split('.');
    for (const part of parts.slice(0, -1)) {
      target = target[part] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    if (unset) delete target[last];
    else target[last] = value;
  };
  return {
    findOne: (filter: {
      portalActive: boolean;
      $or: [{ email: RegExp }, { 'portalUsers.email': RegExp }];
    }) => ({
      select: () => ({
        exec: () => {
          const re = filter.$or[0].email;
          const hit =
            row.portalActive &&
            (re.test(row.email) ||
              row.portalUsers.some((u) => re.test(u.email)));
          return Promise.resolve(hit ? snapshot() : null);
        },
      }),
    }),
    updateOne: (
      filter: Record<string, unknown>,
      update: { $set?: Record<string, unknown>; $unset?: Record<string, ''> },
    ) => ({
      exec: () => {
        for (const [path, value] of Object.entries(update.$set ?? {})) {
          apply(filter, path, value, false);
        }
        for (const path of Object.keys(update.$unset ?? {})) {
          apply(filter, path, undefined, true);
        }
        return Promise.resolve();
      },
    }),
  };
}

describe('PortalWebLoginService', () => {
  const JWT_SECRET = 'test-secret';
  let row: Row;
  let service: PortalWebLoginService;
  let sentCode: string | undefined;
  let sentTo: string | undefined;
  const jwt = new JwtService({});

  beforeEach(() => {
    row = {
      _id: 'cust1',
      email: 'Jo@Example.com',
      name: 'Jo Bloggs',
      phoneNumber: '+44 (0)7700 900 123',
      portalActive: true,
      portalCredentials: { passwordHash: 'app-password' },
      portalUsers: [
        {
          _id: 'user1',
          name: 'Sam Bloggs',
          email: 'sam@example.com',
          phoneNumber: '07700 900 456',
          credentials: {},
        },
      ],
    };
    sentCode = undefined;
    sentTo = undefined;
    const settings = {
      sendTemplatedEmail: jest.fn(
        (_t: unknown, to: string, vars: Record<string, string>) => {
          sentCode = vars.code;
          sentTo = to;
          return Promise.resolve();
        },
      ),
    };
    service = new PortalWebLoginService(
      fakeCustomerModel(row) as unknown as Model<Customer>,
      {} as Model<EmailTemplate>,
      jwt,
      { getOrThrow: () => JWT_SECRET } as unknown as ConfigService,
      settings as unknown as SettingsService,
    );
  });

  const wrong = (code: string) => (code === '000000' ? '111111' : '000000');

  it('takes the last 3 digits of a formatted number', () => {
    expect(lastThreeDigits('+44 (0)7700 900 123')).toBe('123');
    expect(lastThreeDigits('12')).toBeUndefined();
    expect(lastThreeDigits(undefined)).toBeUndefined();
  });

  it('signs in with the emailed code and the last 3 phone digits', async () => {
    await service.requestCode('jo@example.com');
    expect(sentCode).toMatch(/^\d{6}$/);
    // The app's password is untouched.
    expect(row.portalCredentials.passwordHash).toBe('app-password');

    const { stepToken } = await service.verifyCode('jo@example.com', sentCode!);
    // The code is single-use.
    expect(row.portalCredentials.webCodeHash).toBeUndefined();
    await expect(
      service.verifyCode('jo@example.com', sentCode!),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const { token } = await service.verifyPhone(
      'jo@example.com',
      stepToken,
      '123',
    );
    const payload = jwt.verify<{ sub: string; typ: string }>(token, {
      secret: portalJwtSecret(JWT_SECRET),
    });
    expect(payload).toMatchObject({ sub: 'cust1', typ: 'portal' });
    expect(row.portalLastLoginAt).toBeInstanceOf(Date);
    // The step token is single-use too.
    await expect(
      service.verifyPhone('jo@example.com', stepToken, '123'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sends nothing for an unknown or disabled email', async () => {
    await service.requestCode('nobody@example.com');
    row.portalActive = false;
    await service.requestCode('jo@example.com');
    expect(sentCode).toBeUndefined();
  });

  it(`throws the code away after ${WEB_CODE_MAX_ATTEMPTS} wrong guesses`, async () => {
    await service.requestCode('jo@example.com');
    for (let i = 0; i < WEB_CODE_MAX_ATTEMPTS; i++) {
      await expect(
        service.verifyCode('jo@example.com', wrong(sentCode!)),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(
      service.verifyCode('jo@example.com', sentCode!),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired code', async () => {
    await service.requestCode('jo@example.com');
    row.portalCredentials.webCodeExpiresAt = new Date(Date.now() - 1000);
    await expect(
      service.verifyCode('jo@example.com', sentCode!),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it(`restarts after ${WEB_STEP_MAX_ATTEMPTS} wrong phone digits`, async () => {
    await service.requestCode('jo@example.com');
    const { stepToken } = await service.verifyCode('jo@example.com', sentCode!);
    for (let i = 0; i < WEB_STEP_MAX_ATTEMPTS; i++) {
      await expect(
        service.verifyPhone('jo@example.com', stepToken, '999'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(
      service.verifyPhone('jo@example.com', stepToken, '123'),
    ).rejects.toThrow('Please start again');
  });

  it('rejects a step token that was never issued', async () => {
    await service.requestCode('jo@example.com');
    await service.verifyCode('jo@example.com', sentCode!);
    await expect(
      service.verifyPhone('jo@example.com', 'f'.repeat(64), '123'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('stops at the code step when no mobile number is on file', async () => {
    row.phoneNumber = '';
    await service.requestCode('jo@example.com');
    await expect(
      service.verifyCode('jo@example.com', sentCode!),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('signs an additional user in against their own mobile number', async () => {
    await service.requestCode('SAM@example.com');
    expect(sentTo).toBe('sam@example.com');
    const { stepToken } = await service.verifyCode(
      'sam@example.com',
      sentCode!,
    );
    // The customer's own credentials are untouched.
    expect(row.portalCredentials.webStepHash).toBeUndefined();
    // The customer's digits don't work for Sam.
    await expect(
      service.verifyPhone('sam@example.com', stepToken, '123'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const { token } = await service.verifyPhone(
      'sam@example.com',
      stepToken,
      '456',
    );
    const payload = jwt.verify<{ sub: string; uid: string; email: string }>(
      token,
      { secret: portalJwtSecret(JWT_SECRET) },
    );
    expect(payload).toMatchObject({
      sub: 'cust1',
      uid: 'user1',
      email: 'sam@example.com',
    });
    expect(row.portalUsers[0].lastLoginAt).toBeInstanceOf(Date);
    expect(row.portalLastLoginAt).toBeUndefined();
  });
});
