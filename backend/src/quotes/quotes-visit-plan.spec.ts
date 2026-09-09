import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Animal, AnimalSchema } from '../animals/schemas/animal.schema';
import { BankHoliday, BankHolidaySchema } from '../bank-holidays/schemas/bank-holiday.schema';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { DayBooking, DayBookingSchema } from '../day-bookings/schemas/day-booking.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { VisitMapping, VisitMappingSchema } from '../settings/schemas/visit-mapping.schema';
import { QuotesService } from './quotes.service';
import { Quote, QuoteSchema } from './schemas/quote.schema';

// Exercises the accepted-quote -> calendar bookings path against a real
// in-memory MongoDB: persists a visit plan on a quote the same way the
// admin's PATCH would, then replays it and checks the created DayBookings.
describe('createBookingsFromVisitPlan', () => {
  jest.setTimeout(120000);
  let mongod: MongoMemoryServer;
  let quoteModel: Model<Quote>;
  let dayBookingModel: Model<DayBooking>;
  let animalModel: Model<Animal>;
  let customerModel: Model<Customer>;
  let visitMappingModel: Model<VisitMapping>;
  let bankHolidayModel: Model<BankHoliday>;
  let productModel: Model<Product>;
  let service: QuotesService;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(mongod.getUri()),
        MongooseModule.forFeature([
          { name: Quote.name, schema: QuoteSchema },
          { name: DayBooking.name, schema: DayBookingSchema },
          { name: Animal.name, schema: AnimalSchema },
          { name: Customer.name, schema: CustomerSchema },
          { name: VisitMapping.name, schema: VisitMappingSchema },
          { name: BankHoliday.name, schema: BankHolidaySchema },
          { name: Product.name, schema: ProductSchema },
        ]),
      ],
    }).compile();

    quoteModel = moduleRef.get(getModelToken(Quote.name));
    dayBookingModel = moduleRef.get(getModelToken(DayBooking.name));
    animalModel = moduleRef.get(getModelToken(Animal.name));
    customerModel = moduleRef.get(getModelToken(Customer.name));
    visitMappingModel = moduleRef.get(getModelToken(VisitMapping.name));
    bankHolidayModel = moduleRef.get(getModelToken(BankHoliday.name));
    productModel = moduleRef.get(getModelToken(Product.name));

    // Only the four models createBookingsFromVisitPlan touches are real (plus
    // a stubbed audit log); the rest of QuotesService's dependencies aren't
    // exercised by it.
    service = new QuotesService(
      quoteModel,
      null as never,
      customerModel,
      null as never,
      dayBookingModel,
      animalModel,
      visitMappingModel,
      bankHolidayModel,
      null as never,
      { record: async () => undefined } as never,
      null as never,
      null as never,
    );
  });

  afterAll(async () => {
    await mongod.stop();
  });

  it('creates one booking per animal per day, linked to the invoice', async () => {
    const customer = await customerModel.create({ name: 'Jane Doe', email: 'jane@example.com' });
    const petDefaults = {
      species: 'dog',
      breed: 'Lab',
      sex: 'female',
      age: 3,
      vaccinated: true,
      allergies: { status: 'no' },
      medication: { onMedication: false },
      aggressionToPeople: false,
      customer: customer._id,
    };
    const rosie = await animalModel.create({ name: 'Rosie', ...petDefaults });
    const alfie = await animalModel.create({ name: 'Alfie', ...petDefaults });

    const weekday1 = await productModel.create({ name: '1 Visit (Weekday)', price: 10, productCode: 'V1WD' });
    const weekday2 = await productModel.create({ name: '2 Visits (Weekday)', price: 18, productCode: 'V2WD' });
    const weekend1 = await productModel.create({ name: '1 Visit (Weekend)', price: 12, productCode: 'V1WE' });
    const holiday2 = await productModel.create({ name: '2 Visits (Bank Holiday)', price: 25, productCode: 'V2BH' });
    await visitMappingModel.create({
      oneVisitWeekdayProduct: weekday1._id,
      twoVisitWeekdayProduct: weekday2._id,
      oneVisitWeekendProduct: weekend1._id,
      twoVisitBankHolidayProduct: holiday2._id,
    });
    // Friday 25 Dec 2026 marked as a bank holiday.
    await bankHolidayModel.create({ name: 'Christmas Day', date: new Date(2026, 11, 25) });

    // Wed 23 Dec .. Sun 27 Dec 2026: single-visit first day (weekday),
    // 2-visit between days (Thu weekday, Fri bank holiday, Sat weekend --
    // the Sat combination is deliberately left unmapped to prove it's
    // skipped), single-visit last day (Sun weekend).
    const quote = await quoteModel.create({
      quoteNumber: 'QUO-TEST-1',
      customer: customer._id,
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 1 }],
      issueDate: new Date(),
      validUntil: new Date(),
      visitPlan: {
        animals: [rosie._id, alfie._id],
        startDate: '2026-12-23',
        endDate: '2026-12-27',
        visitsPerDay: '2',
        visitsFirstDay: '1',
        visitsLastDay: '1',
      },
    });
    expect(quote.visitPlan).toBeDefined();
    expect(quote.visitPlan!.animals).toHaveLength(2);

    const invoiceId = customer._id!.toString(); // any ObjectId string works as the link
    const fetched = await quoteModel.findById(quote._id).exec();
    await (service as unknown as { createBookingsFromVisitPlan(q: Quote, i: string): Promise<void> })
      .createBookingsFromVisitPlan(fetched!, invoiceId);

    const bookings = await dayBookingModel.find().sort({ date: 1 }).exec();
    // 5 days x 2 animals, minus the unmapped 2-visit weekend day (26th) = 8.
    expect(bookings).toHaveLength(8);

    const byDay = new Map<string, DayBooking[]>();
    for (const b of bookings) {
      const key = `${b.date.getFullYear()}-${b.date.getMonth() + 1}-${b.date.getDate()}`;
      byDay.set(key, [...(byDay.get(key) ?? []), b]);
    }
    expect(byDay.get('2026-12-23')!.map((b) => String(b.product))).toEqual([String(weekday1._id), String(weekday1._id)]);
    expect(byDay.get('2026-12-23')![0].visitTime).toBe('PM'); // single-visit first day
    expect(byDay.get('2026-12-24')![0].product.toString()).toBe(String(weekday2._id));
    expect(byDay.get('2026-12-25')![0].product.toString()).toBe(String(holiday2._id)); // bank holiday
    expect(byDay.get('2026-12-26')).toBeUndefined(); // unmapped combination skipped
    expect(byDay.get('2026-12-27')![0].product.toString()).toBe(String(weekend1._id));
    expect(byDay.get('2026-12-27')![0].visitTime).toBe('AM'); // single-visit last day
    for (const b of bookings) {
      expect(String(b.customer)).toBe(String(customer._id));
      expect(String(b.invoice)).toBe(invoiceId);
      expect(b.quantity).toBe(1);
    }
  });

  it('does nothing for a quote without a visit plan', async () => {
    await dayBookingModel.deleteMany({});
    const quote = await quoteModel.create({
      quoteNumber: 'QUO-TEST-2',
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 1 }],
      manualCustomerName: 'M',
      manualCustomerEmail: 'm@example.com',
      issueDate: new Date(),
      validUntil: new Date(),
    });
    await (service as unknown as { createBookingsFromVisitPlan(q: Quote, i: string): Promise<void> })
      .createBookingsFromVisitPlan(quote, quote._id!.toString());
    expect(await dayBookingModel.countDocuments()).toBe(0);
  });
});
