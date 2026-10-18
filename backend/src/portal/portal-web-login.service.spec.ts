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
type Row = {
  _id: string;
  email: string;
  name: string;
  phoneNumber?: string;
  portalActive: boolean;
  portalCredentials: Creds;
  portalLastLoginAt?: Date;
};

// A one-customer stand-in for the Customer model: findOne honours the
// email regex + portalActive filter, updateOne applies dotted $set/$unset.
function fakeCustomerModel(row: Row) {
  return {
    findOne: (filter: { email: RegExp; portalActive: boolean }) => ({
      select: () => ({
        exec: () =>
          Promise.resolve(
            filter.email.test(row.email) && row.portalActive
              ? {
                  ...row,
                  portalCredentials: { ...row.portalCredentials },
                }
              : null,
          ),
      }),
    }),
    updateOne: (
      _filter: unknown,
      update: { $set?: Record<string, unknown>; $unset?: Record<string, ''> },
    ) => ({
      exec: () => {
        for (const [path, value] of Object.entries(update.$set ?? {})) {
          if (path.startsWith('portalCredentials.')) {
            row.portalCredentials[path.split('.')[1]] = value;
          } else {
            (row as Record<string, unknown>)[path] = value;
          }
        }
        for (const path of Object.keys(update.$unset ?? {})) {
          delete row.portalCredentials[path.split('.')[1]];
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
  const jwt = new JwtService({});

  beforeEach(() => {
    row = {
      _id: 'cust1',
      email: 'Jo@Example.com',
      name: 'Jo Bloggs',
      phoneNumber: '+44 (0)7700 900 123',
      portalActive: true,
      portalCredentials: { passwordHash: 'app-password' },
    };
    sentCode = undefined;
    const settings = {
      sendTemplatedEmail: jest.fn(
        (_t: unknown, _to: string, vars: Record<string, string>) => {
          sentCode = vars.code;
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
});
