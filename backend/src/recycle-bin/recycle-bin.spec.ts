import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Connection, Types } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../app.module';
import { recycleBinContextMiddleware } from './recycle-bin.context';

// Boots the real AppModule against an in-memory MongoDB and drives it over
// HTTP, so this covers the whole path: the middleware giving a DELETE
// request its context, the plugin catching each service's own deletes
// (including cascades), and restore putting balances back.
describe('Recycle Bin', () => {
  jest.setTimeout(120000);
  let mongod: MongoMemoryServer;
  let app: INestApplication;
  let db: Connection['db'];
  let token: string;
  let restrictedToken: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.JWT_SECRET = 'test-secret';
    process.env.ENCRYPTION_KEY = 'test-encryption-key-that-is-long-enough';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(recycleBinContextMiddleware);
    await app.init();
    db = app.get<Connection>(getConnectionToken()).db;

    const jwt = new JwtService({ secret: 'test-secret' });
    const staff = await db!
      .collection(app.get(getModelToken('Staff')).collection.collectionName)
      .insertOne({
        name: 'Jo Admin',
        email: 'jo@example.com',
        username: 'jo',
        passwordHash: 'x',
      });
    token = jwt.sign({
      sub: String(staff.insertedId),
      email: 'jo@example.com',
      name: 'Jo Admin',
    });
    const role = await db!
      .collection('roles')
      .insertOne({
        name: 'Walker',
        permissions: ['customers.manage', 'financial.manage'],
      });
    const walker = await db!
      .collection(app.get(getModelToken('Staff')).collection.collectionName)
      .insertOne({
        name: 'Sam Walker',
        email: 'sam@example.com',
        username: 'sam',
        passwordHash: 'x',
        role: role.insertedId,
      });
    restrictedToken = jwt.sign({
      sub: String(walker.insertedId),
      email: 'sam@example.com',
      name: 'Sam Walker',
    });
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
  });

  const api = () => request(app.getHttpServer());
  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

  async function seed() {
    const account = await db!
      .collection('bankaccounts')
      .insertOne({ name: 'Current', type: 'current', currentBalance: 1000 });
    const customer = await db!
      .collection('customers')
      .insertOne({ name: 'Jane Smith', email: 'jane@example.com' });
    const pet = await db!
      .collection('animals')
      .insertOne({
        customer: customer.insertedId,
        name: 'Bella',
        species: 'dog',
      });
    const invoice = await db!.collection('invoices').insertOne({
      customer: customer.insertedId,
      invoiceNumber: `INV-${Math.floor(Math.random() * 1e6)}`,
      lineItems: [],
      subtotal: 100,
      total: 100,
      amountPaid: 100,
      status: 'paid',
      paidAt: new Date(),
      issueDate: new Date(),
      dueDate: new Date(),
    });
    const payment = await db!.collection('payments').insertOne({
      paymentId: `PAY-${Math.floor(Math.random() * 1e6)}`,
      invoice: invoice.insertedId,
      date: new Date(),
      amount: 100,
      account: account.insertedId,
    });
    return {
      accountId: account.insertedId,
      customerId: customer.insertedId,
      petId: pet.insertedId,
      invoiceId: invoice.insertedId,
      paymentId: payment.insertedId,
    };
  }

  const balance = async (id: Types.ObjectId) =>
    (await db!.collection('bankaccounts').findOne({ _id: id }))!.currentBalance;
  const invoice = async (id: Types.ObjectId) =>
    db!.collection('invoices').findOne({ _id: id });

  async function binEntries() {
    const res = await api().get('/recycle-bin').set(auth()).expect(200);
    return res.body as {
      id: string;
      typeLabel: string;
      label: string;
      customerName?: string;
      itemCount: number;
      alsoIncludes: string;
      deletedBy: string;
    }[];
  }

  it('moves a deleted payment to the bin, and restoring it re-applies it to the invoice and account', async () => {
    const s = await seed();
    await api().delete(`/payments/${s.paymentId}`).set(auth()).expect(200);
    expect(
      await db!.collection('payments').findOne({ _id: s.paymentId }),
    ).toBeNull();
    expect(await balance(s.accountId)).toBe(900);
    expect((await invoice(s.invoiceId))!.amountPaid).toBe(0);

    const entry = (await binEntries()).find((e) => e.typeLabel === 'Payment')!;
    expect(entry.label).toMatch(/^£100\.00 payment PAY-/);
    expect(entry).toMatchObject({
      customerName: 'Jane Smith',
      itemCount: 1,
      deletedBy: 'Jo Admin',
    });

    await api()
      .post(`/recycle-bin/${entry.id}/restore`)
      .set(auth())
      .expect(201);
    expect(
      await db!.collection('payments').findOne({ _id: s.paymentId }),
    ).not.toBeNull();
    expect(await balance(s.accountId)).toBe(1000);
    const inv = await invoice(s.invoiceId);
    expect(inv!.amountPaid).toBe(100);
    expect(inv!.status).toBe('paid');
    expect((await binEntries()).find((e) => e.id === entry.id)).toBeUndefined();
  });

  it('keeps a force-deleted customer and everything cascaded with them as one entry, and restores it all', async () => {
    const s = await seed();
    await api()
      .delete(`/customers/${s.customerId}?force=true`)
      .set(auth())
      .expect(200);

    for (const [coll, id] of [
      ['customers', s.customerId],
      ['animals', s.petId],
      ['invoices', s.invoiceId],
      ['payments', s.paymentId],
    ] as const) {
      expect(await db!.collection(coll).findOne({ _id: id })).toBeNull();
    }
    expect(await balance(s.accountId)).toBe(900);

    const entry = (await binEntries()).find(
      (e) => e.typeLabel === 'Customer' && e.label === 'Jane Smith',
    )!;
    expect(entry.itemCount).toBe(4);
    expect(entry.alsoIncludes).toBe('1 payment, 1 invoice, 1 pet');

    await api()
      .post(`/recycle-bin/${entry.id}/restore`)
      .set(auth())
      .expect(201);
    expect(
      await db!.collection('customers').findOne({ _id: s.customerId }),
    ).toMatchObject({ name: 'Jane Smith' });
    expect(
      await db!.collection('animals').findOne({ _id: s.petId }),
    ).toMatchObject({ name: 'Bella' });
    expect(
      await db!.collection('payments').findOne({ _id: s.paymentId }),
    ).not.toBeNull();
    expect((await invoice(s.invoiceId))!.amountPaid).toBe(100);
    expect(await balance(s.accountId)).toBe(1000);
  });

  it("won't restore a payment whose invoice has since been deleted separately", async () => {
    const s = await seed();
    await api().delete(`/payments/${s.paymentId}`).set(auth()).expect(200);
    await api().delete(`/invoices/${s.invoiceId}`).set(auth()).expect(200);
    const entries = await binEntries();
    const paymentEntry = entries.find((e) => e.typeLabel === 'Payment')!;
    const res = await api()
      .post(`/recycle-bin/${paymentEntry.id}/restore`)
      .set(auth())
      .expect(409);
    expect(res.body.message).toMatch(/its invoice has been deleted too/);

    // Invoice first, then the payment, works.
    const invoiceEntry = entries.find((e) => e.typeLabel === 'Invoice')!;
    await api()
      .post(`/recycle-bin/${invoiceEntry.id}/restore`)
      .set(auth())
      .expect(201);
    await api()
      .post(`/recycle-bin/${paymentEntry.id}/restore`)
      .set(auth())
      .expect(201);
    expect((await invoice(s.invoiceId))!.amountPaid).toBe(100);
  });

  it('only lets staff with recycleBin.purge permanently delete, and that delete is real', async () => {
    const s = await seed();
    await api().delete(`/payments/${s.paymentId}`).set(auth()).expect(200);
    const entry = (await binEntries()).find((e) => e.typeLabel === 'Payment')!;

    await api()
      .delete(`/recycle-bin/${entry.id}`)
      .set(auth(restrictedToken))
      .expect(403);
    await api().delete(`/recycle-bin/${entry.id}`).set(auth()).expect(200);
    expect((await binEntries()).find((e) => e.id === entry.id)).toBeUndefined();
    expect(
      await db!
        .collection('recyclebinitems')
        .countDocuments({ entry: new Types.ObjectId(entry.id) }),
    ).toBe(0);
  });

  it('grants recycleBin.purge to the seeded Admin role', async () => {
    const admin = await db!.collection('roles').findOne({ name: 'Admin' });
    expect(admin!.permissions).toContain('recycleBin.purge');
  });

  it('leaves deletes outside a DELETE request (e.g. background clean-ups) as real deletes', async () => {
    const before = await db!.collection('recyclebinitems').countDocuments();
    const s = await seed();
    const animalModel = app.get(getModelToken('Animal'));
    await animalModel.findByIdAndDelete(s.petId).exec();
    expect(
      await db!.collection('animals').findOne({ _id: s.petId }),
    ).toBeNull();
    expect(await db!.collection('recyclebinitems').countDocuments()).toBe(
      before,
    );
  });

  it('puts a deleted incident report back on its boarding booking', async () => {
    const s = await seed();
    const report = await db!
      .collection('formsubmissions')
      .insertOne({
        formName: 'Incident Report',
        customer: s.customerId,
        status: 'completed',
      });
    const booking = await db!.collection('boardingbookings').insertOne({
      customer: s.customerId,
      reference: 'BK-1',
      incidentReports: [report.insertedId],
    });
    await api()
      .delete(
        `/boarding-bookings/${booking.insertedId}/incident-reports/${report.insertedId}`,
      )
      .set(auth())
      .expect(200);
    expect(
      (await db!
        .collection('boardingbookings')
        .findOne({ _id: booking.insertedId }))!.incidentReports,
    ).toEqual([]);

    const entry = (await binEntries()).find(
      (e) => e.label === 'Incident Report',
    )!;
    expect(entry).toMatchObject({
      typeLabel: 'Form',
      customerName: 'Jane Smith',
      itemCount: 1,
    });
    await api()
      .post(`/recycle-bin/${entry.id}/restore`)
      .set(auth())
      .expect(201);
    expect(
      (await db!
        .collection('boardingbookings')
        .findOne({ _id: booking.insertedId }))!.incidentReports,
    ).toEqual([report.insertedId]);
  });

  it('bins a record deleted with doc.deleteOne() once, not twice', async () => {
    const form = await db!
      .collection('preboardingforms')
      .insertOne({
        firstName: 'Ann',
        surname: 'Lee',
        email: 'ann@example.com',
        dogNames: ['Rex'],
      });
    await api()
      .delete(`/pre-boarding/${form.insertedId}`)
      .set(auth())
      .expect(200);
    const entry = (await binEntries()).find(
      (e) => e.typeLabel === 'Pre-boarding form',
    )!;
    expect(entry).toMatchObject({ label: 'Ann Lee (Rex)', itemCount: 1 });
    expect(
      await db!
        .collection('recyclebinitems')
        .countDocuments({ docId: form.insertedId }),
    ).toBe(1);
  });

  it('adds nothing to the bin when a delete is blocked', async () => {
    const before = await db!.collection('recyclebinitems').countDocuments();
    const s = await seed();
    await api().delete(`/customers/${s.customerId}`).set(auth()).expect(409);
    expect(
      await db!.collection('customers').findOne({ _id: s.customerId }),
    ).not.toBeNull();
    expect(await db!.collection('recyclebinitems').countDocuments()).toBe(
      before,
    );
  });

  it('empties the whole bin', async () => {
    const s = await seed();
    await api().delete(`/payments/${s.paymentId}`).set(auth()).expect(200);
    await api().delete('/recycle-bin').set(auth()).expect(200);
    expect(await binEntries()).toEqual([]);
  });
});
