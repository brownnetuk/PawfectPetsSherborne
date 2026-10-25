import { Model, Types } from 'mongoose';
import {
  Customer,
  PortalCredentials,
  PortalUser,
} from '../customers/schemas/customer.schema';

// Who is signing in to the portal realm: either the customer themselves (by
// the customer's own email) or one of the additional people staff added under
// Mobile App Access (Customer.portalUsers). Both get the same access to the
// customer's account; only the identity details and credential slots differ.
export interface PortalAccount {
  customer: Customer;
  // Set when signing in as an additional user.
  user?: PortalUser;
  email: string;
  name: string;
  phoneNumber?: string;
  creds: PortalCredentials;
}

export const escapeRegex = (value: string) =>
  value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const emailRegex = (email: string) =>
  new RegExp(`^${escapeRegex(email)}$`, 'i');

// Case-insensitive lookup of a portal-enabled account by login email, with the
// hidden credentials loaded. Returns null when no such active account.
export async function findActivePortalAccount(
  model: Model<Customer>,
  email: string,
): Promise<PortalAccount | null> {
  const re = emailRegex(email);
  const customer = await model
    .findOne({
      portalActive: true,
      $or: [{ email: re }, { 'portalUsers.email': re }],
    })
    .select('+portalCredentials +portalUsers')
    .exec();
  if (!customer) return null;
  if (customer.email && re.test(customer.email)) {
    return {
      customer,
      email: customer.email,
      name: customer.name ?? '',
      phoneNumber: customer.phoneNumber,
      creds: customer.portalCredentials ?? {},
    };
  }
  const user = customer.portalUsers?.find((u) => re.test(u.email));
  if (!user) return null;
  return {
    customer,
    user,
    email: user.email,
    name: user.name,
    phoneNumber: user.phoneNumber,
    creds: user.credentials ?? {},
  };
}

// The updateOne filter + dotted path prefix that address this account's
// credentials and last-login fields.
function target(account: PortalAccount) {
  if (!account.user) {
    return {
      filter: { _id: account.customer._id } as Record<string, unknown>,
      creds: 'portalCredentials',
      lastLogin: 'portalLastLoginAt',
    };
  }
  return {
    filter: {
      _id: account.customer._id,
      'portalUsers._id': account.user._id,
    } as Record<string, unknown>,
    creds: 'portalUsers.$.credentials',
    lastLogin: 'portalUsers.$.lastLoginAt',
  };
}

// Sets (or, for undefined values, unsets) individual credential fields.
export async function setAccountCreds(
  model: Model<Customer>,
  account: PortalAccount,
  fields: Record<string, unknown>,
  opts: { touchLogin?: boolean } = {},
): Promise<void> {
  const t = target(account);
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) unset[`${t.creds}.${key}`] = '';
    else set[`${t.creds}.${key}`] = value;
  }
  if (opts.touchLogin) set[t.lastLogin] = new Date();
  const update: Record<string, unknown> = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  if (!Object.keys(update).length) return;
  await model.updateOne(t.filter, update).exec();
}

// Replaces the whole credentials sub-doc (e.g. after a password is set, so
// every outstanding code is dropped at once).
export async function replaceAccountCreds(
  model: Model<Customer>,
  account: PortalAccount,
  creds: PortalCredentials,
  opts: { touchLogin?: boolean } = {},
): Promise<void> {
  const t = target(account);
  const set: Record<string, unknown> = { [t.creds]: creds };
  if (opts.touchLogin) set[t.lastLogin] = new Date();
  await model.updateOne(t.filter, { $set: set }).exec();
}

// The portal JWT payload for an account. `uid` marks an additional user so the
// guard can revoke them individually when staff remove their access.
export function portalTokenPayload(account: PortalAccount) {
  return {
    sub: account.customer._id?.toString(),
    email: account.email,
    typ: 'portal' as const,
    ...(account.user?._id ? { uid: account.user._id.toString() } : {}),
  };
}

export const isObjectId = (id: string) => Types.ObjectId.isValid(id);
