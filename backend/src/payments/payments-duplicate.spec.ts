import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../app.module';

// The same payment recorded twice (two tabs, two devices, or a stale invoice
// list) used to create two Payment records. POST /payments now refuses a
// payment against an invoice that's already paid, unless staff confirmed the
// "already paid" prompt (allowPaidInvoice).
describe('Payments: duplicate guard', () => {
  jest.setTimeout(120000);
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let db: Connection['db'];
  let token: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.JWT_SECRET = 'test-secret';
    process.env.ENCRYPTION_KEY = 'test-encryption-key-that-is-long-enough';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    db = app.get<Connection>(getConnectionToken()).db;
    const staff = await db!
      .collection(app.get(getModelToken('Staff')).collection.collectionName)
      .insertOne({
        name: 'Jo Admin',
        email: 'jo@example.com',
        username: 'jo',
        passwordHash: 'x',
      });
    token = new JwtService({ secret: 'test-secret' }).sign({
      sub: String(staff.insertedId),
      email: 'jo@example.com',
      name: 'Jo Admin',
    });
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
  });

  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function seed() {
    const account = await db!
      .collection('bankaccounts')
      .insertOne({ name: 'Monzo', type: 'current', currentBalance: 0 });
    const customer = await db!
      .collection('customers')
      .insertOne({ name: 'Jane Smith' });
    const invoice = await db!.collection('invoices').insertOne({
      customer: customer.insertedId,
      invoiceNumber: `INV-${Math.floor(Math.random() * 1e6)}`,
      lineItems: [],
      subtotal: 94.5,
      total: 94.5,
      amountPaid: 0,
      status: 'sent',
      issueDate: new Date(),
      dueDate: new Date(),
    });
    return { accountId: account.insertedId, invoiceId: invoice.insertedId };
  }

  const pay = (
    s: { accountId: Types.ObjectId; invoiceId: Types.ObjectId },
    extra: Record<string, unknown> = {},
  ) =>
    api()
      .post('/payments')
      .set(auth())
      .send({
        invoice: String(s.invoiceId),
        account: String(s.accountId),
        date: '2026-11-28',
        amount: 94.5,
        skipThankYouEmail: true,
        ...extra,
      });

  const paymentsFor = (id: Types.ObjectId) =>
    db!.collection('payments').countDocuments({ invoice: id });
  const invoice = (id: Types.ObjectId) =>
    db!.collection('invoices').findOne({ _id: id });
  const balance = async (id: Types.ObjectId) =>
    (await db!.collection('bankaccounts').findOne({ _id: id }))!.currentBalance;

  it('records the first payment and refuses the same one again', async () => {
    const s = await seed();
    await pay(s).expect(201);
    const res = await pay(s).expect(409);
    expect(res.body.message).toMatch(/already paid/);
    expect(await paymentsFor(s.invoiceId)).toBe(1);
    const inv = await invoice(s.invoiceId);
    expect(inv!.amountPaid).toBe(94.5);
    expect(inv!.status).toBe('paid');
    expect(await balance(s.accountId)).toBe(94.5);
  });

  it('lets only one of two simultaneous submissions through', async () => {
    const s = await seed();
    const results = await Promise.all([pay(s), pay(s), pay(s)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await paymentsFor(s.invoiceId)).toBe(1);
    expect((await invoice(s.invoiceId))!.amountPaid).toBe(94.5);
    expect(await balance(s.accountId)).toBe(94.5);
  });

  it('still allows another payment when staff confirmed the "already paid" prompt', async () => {
    const s = await seed();
    await pay(s).expect(201);
    await pay(s, { allowPaidInvoice: true }).expect(201);
    expect(await paymentsFor(s.invoiceId)).toBe(2);
    expect((await invoice(s.invoiceId))!.amountPaid).toBe(189);
  });

  it('allows part payments until the invoice is covered', async () => {
    const s = await seed();
    await pay(s, { amount: 50 }).expect(201);
    expect((await invoice(s.invoiceId))!.status).toBe('sent');
    await pay(s, { amount: 44.5 }).expect(201);
    const inv = await invoice(s.invoiceId);
    expect(inv!.status).toBe('paid');
    expect(inv!.paidAt).toBeTruthy();
  });

  it('deleting the duplicate leaves the invoice paid and takes it off the account', async () => {
    const s = await seed();
    await pay(s).expect(201);
    const dup = await pay(s, { allowPaidInvoice: true }).expect(201);
    await api().delete(`/payments/${dup.body._id}`).set(auth()).expect(200);
    const inv = await invoice(s.invoiceId);
    expect(inv!.amountPaid).toBe(94.5);
    expect(inv!.status).toBe('paid');
    expect(await balance(s.accountId)).toBe(94.5);
  });
});
