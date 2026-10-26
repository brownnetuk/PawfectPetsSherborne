import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { Customer } from '../customers/schemas/customer.schema';
import { portalJwtSecret } from './portal-jwt.util';
import {
  APP_PHONE_MAX_ATTEMPTS,
  PHONE_DIGITS_REQUIRED,
  PortalService,
} from './portal.service';

type Creds = Record<string, unknown>;

// The customer app's set-up/login flow for an additional user. Same shape of
// fake as portal-web-login.service.spec.ts, kept to what PortalService uses.
describe('PortalService (additional users in the app)', () => {
  const JWT_SECRET = 'test-secret';
  const jwt = new JwtService({});
  let user: {
    _id: string;
    name: string;
    email: string;
    phoneNumber: string;
    credentials: Creds;
    lastLoginAt?: Date;
  };
  let primaryCreds: Creds;
  let sentCode: string | undefined;
  let service: PortalService;

  beforeEach(() => {
    primaryCreds = { passwordHash: 'x' };
    user = {
      _id: 'user1',
      name: 'Sam',
      email: 'sam@example.com',
      phoneNumber: '07700 900 456',
      credentials: {},
    };
    const model = {
      findOne: () => ({
        select: () => ({
          exec: () =>
            Promise.resolve({
              _id: 'cust1',
              email: 'jo@example.com',
              name: 'Jo',
              phoneNumber: '07700 900 123',
              portalActive: true,
              portalCredentials: { ...primaryCreds },
              portalUsers: [{ ...user, credentials: { ...user.credentials } }],
            }),
        }),
      }),
      updateOne: (
        filter: Record<string, unknown>,
        update: { $set?: Record<string, unknown>; $unset?: Record<string, ''> },
      ) => ({
        exec: () => {
          // Only the additional user should ever be written to here.
          expect(filter['portalUsers._id']).toBe('user1');
          for (const [path, value] of Object.entries(update.$set ?? {})) {
            if (path === 'portalUsers.$.credentials')
              user.credentials = value as Creds;
            else if (path === 'portalUsers.$.lastLoginAt')
              user.lastLoginAt = value as Date;
            else user.credentials[path.split('.').pop()!] = value;
          }
          for (const path of Object.keys(update.$unset ?? {})) {
            delete user.credentials[path.split('.').pop()!];
          }
          return Promise.resolve();
        },
      }),
    };
    sentCode = undefined;
    const settings = {
      sendTemplatedEmail: jest.fn(
        (_t: unknown, to: string, vars: Record<string, string>) => {
          expect(to).toBe('sam@example.com');
          sentCode = vars.code;
          return Promise.resolve();
        },
      ),
    };
    const none = {} as never;
    service = new PortalService(
      model as unknown as Model<Customer>,
      none,
      jwt,
      { getOrThrow: () => JWT_SECRET } as unknown as ConfigService,
      settings as never,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
      none,
    );
  });

  it('needs the last 3 digits of their mobile to set a password', async () => {
    await service.requestCode('sam@example.com', 'login');
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(await service.verifyCode('sam@example.com', sentCode!)).toEqual({
      phoneDigitsRequired: true,
    });

    await expect(
      service.setPassword('sam@example.com', sentCode!, 'password1'),
    ).rejects.toMatchObject({ response: { code: PHONE_DIGITS_REQUIRED } });
    // The customer's own digits don't count.
    await expect(
      service.setPassword('sam@example.com', sentCode!, 'password1', '123'),
    ).rejects.toBeInstanceOf(BadRequestException);

    const { token } = await service.setPassword(
      'sam@example.com',
      sentCode!,
      'password1',
      '456',
    );
    expect(
      jwt.verify(token, { secret: portalJwtSecret(JWT_SECRET) }),
    ).toMatchObject({ sub: 'cust1', uid: 'user1', typ: 'portal' });
    expect(
      await bcrypt.compare(
        'password1',
        user.credentials.passwordHash as string,
      ),
    ).toBe(true);
    expect(user.credentials.loginCodeHash).toBeUndefined();
    expect(primaryCreds).toEqual({ passwordHash: 'x' });

    await expect(
      service.login('sam@example.com', 'password1'),
    ).resolves.toHaveProperty('token');
    expect(user.lastLoginAt).toBeInstanceOf(Date);
  });

  it(`throws the code away after ${APP_PHONE_MAX_ATTEMPTS} wrong digit guesses`, async () => {
    await service.requestCode('sam@example.com', 'reset');
    for (let i = 0; i < APP_PHONE_MAX_ATTEMPTS - 1; i++) {
      await expect(
        service.setPassword('sam@example.com', sentCode!, 'password1', '999'),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      service.setPassword('sam@example.com', sentCode!, 'password1', '999'),
    ).rejects.toThrow('Please request a new code');
    await expect(
      service.setPassword('sam@example.com', sentCode!, 'password1', '456'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('PortalService.deleteAppAccount', () => {
  let updates: { filter: unknown; update: unknown }[];
  let push: {
    removeCustomerTokens: jest.Mock;
    removePortalUserTokens: jest.Mock;
  };
  let notifications: { dispatch: jest.Mock };
  let service: PortalService;

  beforeEach(() => {
    updates = [];
    const model = {
      findById: () => ({
        select: () => ({
          exec: () =>
            Promise.resolve({
              _id: 'cust1',
              name: 'Jo',
              portalActive: true,
              portalUsers: [{ _id: 'user1', name: 'Sam' }],
            }),
        }),
      }),
      updateOne: (filter: unknown, update: unknown) => ({
        exec: () => {
          updates.push({ filter, update });
          return Promise.resolve();
        },
      }),
    };
    push = {
      removeCustomerTokens: jest.fn(() => Promise.resolve()),
      removePortalUserTokens: jest.fn(() => Promise.resolve()),
    };
    notifications = { dispatch: jest.fn(() => Promise.resolve()) };
    const none = {} as never;
    service = new PortalService(
      model as unknown as Model<Customer>,
      none,
      new JwtService({}),
      none,
      none,
      none,
      none,
      none,
      none,
      notifications as never,
      push as never,
      none,
      none,
      none,
    );
  });

  it('deletes the customer sign-in and switches app access off', async () => {
    await service.deleteAppAccount('cust1', undefined, false);
    expect(updates).toEqual([
      {
        filter: { _id: 'cust1' },
        update: {
          $set: { portalActive: false },
          $unset: { portalCredentials: '', portalLastLoginAt: '' },
        },
      },
    ]);
    expect(push.removeCustomerTokens).toHaveBeenCalledWith('cust1');
    expect(notifications.dispatch).toHaveBeenCalledWith(
      'App account deleted',
      'Jo deleted their app account.',
      'portalAccountDeleted',
    );
  });

  it('removes only the additional user, and passes on an erasure request', async () => {
    await service.deleteAppAccount('cust1', 'user1', true);
    expect(updates).toEqual([
      {
        filter: { _id: 'cust1' },
        update: { $pull: { portalUsers: { _id: 'user1' } } },
      },
    ]);
    expect(push.removePortalUserTokens).toHaveBeenCalledWith('user1');
    expect(push.removeCustomerTokens).not.toHaveBeenCalled();
    expect(notifications.dispatch).toHaveBeenCalledWith(
      'Data erasure requested',
      'Sam (additional user for Jo) deleted their app account and asked for their personal data to be erased.',
      'portalAccountDeleted',
    );
  });
});
