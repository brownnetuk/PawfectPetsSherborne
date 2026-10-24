import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';

// One of these per HTTP DELETE request (see recycleBinContextMiddleware
// below). Everything recycleBinPlugin captures while the request runs --
// the record the route was asked to delete plus anything its service
// cascades into (a force-deleted customer's pets, bookings, invoices,
// payments...) -- lands in the same Recycle Bin entry, so it can all be
// restored together in one go.
export interface RecycleBinContext {
  req: Request;
  entryId: Types.ObjectId;
  // Resolves once the entry header has been written -- shared so two
  // deletes running in parallel (Promise.all) in one request don't both try
  // to insert it.
  entryReady?: Promise<void>;
  seq: number;
  // `${collection}:${id}` of every record already captured, so a
  // document-level deleteOne() that Mongoose also runs through the
  // query-level hook isn't stored twice.
  captured: Set<string>;
  // Customer names keyed by id, remembered as customers are captured so a
  // record deleted after its customer (or looked up mid-cascade) can still
  // say whose it was.
  customerNames: Map<string, string>;
  // `$pull`s seen during the request -- e.g. an incident report being
  // unlinked from its boarding booking just before it's deleted -- so the
  // captured record can remember where to be linked back to on restore.
  pulls: {
    collection: string;
    ids: Types.ObjectId[];
    field: string;
    value: string;
  }[];
}

export const recycleBinStorage = new AsyncLocalStorage<RecycleBinContext>();

export function currentRecycleBinContext(): RecycleBinContext | undefined {
  return recycleBinStorage.getStore();
}

// Registered in main.ts. Only DELETE requests get a context: that's every
// "Delete ..." action across the admin app, staff app and customer app. A
// PATCH/POST that happens to replace records as part of an edit (e.g. a
// boarding booking's dates changing regenerating its calendar days), and
// background jobs (scheduled clean-ups), have no context, so their deletes
// stay real deletes rather than filling the bin with noise.
export function recycleBinContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.method !== 'DELETE') {
    next();
    return;
  }
  recycleBinStorage.run(
    {
      req,
      entryId: new Types.ObjectId(),
      seq: 0,
      captured: new Set(),
      customerNames: new Map(),
      pulls: [],
    },
    () => next(),
  );
}

// Who did the deleting, for display only. Staff routes have req.user from
// JwtStrategy; customer-app routes have the portal strategy's
// { customerId } instead.
export function actorFromContext(ctx: RecycleBinContext): string {
  const user = (
    ctx.req as Request & { user?: { name?: string; customerId?: string } }
  ).user;
  if (user?.name) return user.name;
  if (user?.customerId) return 'Customer';
  return 'Staff';
}

// The ids in the request path (e.g. /customers/<id>), used to work out
// which captured record the entry is "about" -- a force-deleted customer's
// entry is listed as that customer, not as whichever of their bookings
// happened to be deleted first.
export function pathIds(req: Request): string[] {
  return (req.originalUrl ?? req.url)
    .split('?')[0]
    .split('/')
    .filter((s) => /^[a-f0-9]{24}$/i.test(s));
}
