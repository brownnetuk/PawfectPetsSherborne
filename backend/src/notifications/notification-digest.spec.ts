import { Types } from 'mongoose';
import { NotificationService } from './notification.service';

// The daily "Today's schedule" digest: walks (anything not a mapped visit /
// day care / boarding product) are counted alongside visits, travel-charge
// rows and boarding pick-up placeholders are not, and the push links to the
// day's calendar.
describe('daily digest', () => {
  const push = { configured: true, sendToAll: jest.fn(), setBadgeOnAll: jest.fn() };
  const itemId = new Types.ObjectId();
  const itemModel = {
    create: jest.fn(async (_doc: Record<string, unknown>) => ({ _id: itemId })),
    countDocuments: jest.fn(() => ({ exec: async () => 0 })),
  };
  const walkProduct = new Types.ObjectId();
  const visitProduct = new Types.ObjectId();
  const boardingProduct = new Types.ObjectId();
  const travelProduct = new Types.ObjectId();
  const dog = (id: string) => ({ _id: id, species: 'dog' });
  const cat = (id: string) => ({ _id: id, species: 'cat' });
  const travelCustomer = { _id: 'c1', travelProduct };

  const bookings = [
    { product: walkProduct, quantity: 1, animal: dog('d1'), additionalAnimals: [dog('d2')], customer: travelCustomer },
    { product: walkProduct, quantity: 1, animal: dog('d3'), additionalAnimals: [], customer: { _id: 'c2' } },
    // The travel-charge row booked alongside the first walk: not a walk.
    { product: travelProduct, quantity: 1, animal: dog('d1'), additionalAnimals: [], customer: travelCustomer },
    { product: visitProduct, quantity: 1, animal: cat('k1'), additionalAnimals: [], customer: { _id: 'c3' } },
    { product: boardingProduct, quantity: 1, animal: dog('d4'), additionalAnimals: [], customer: { _id: 'c4' }, boardingStay: true },
    // Pick-up-day placeholder: presence only.
    { product: boardingProduct, quantity: 1, animal: dog('d4'), additionalAnimals: [], customer: { _id: 'c4' }, boardingStay: true, placeholder: true },
  ];
  const chain = (result: unknown) => {
    const q = { populate: () => q, exec: async () => result };
    return q;
  };
  const dayBookingModel = { find: () => chain(bookings) };
  const visitMappingModel = { findOne: () => ({ exec: async () => ({ oneVisitWeekdayProduct: visitProduct, boardingPerDayProduct: boardingProduct }) }) };
  const appointmentModel = { countDocuments: () => ({ exec: async () => 1 }) };
  const markDigestSent = jest.fn();

  it('counts walks, skips travel rows and placeholders, and links to the day', async () => {
    const service = new NotificationService(
      push as never,
      { get: async () => ({ dailyDigest: true, dailyDigestTime: '00:00' }), markDigestSent } as never,
      {} as never,
      dayBookingModel as never,
      appointmentModel as never,
      itemModel as never,
      visitMappingModel as never,
    );
    await service.dailyDigest();
    expect(itemModel.create).toHaveBeenCalledTimes(1);
    const doc = itemModel.create.mock.calls[0][0];
    expect(doc.title).toBe("Today's schedule");
    expect(doc.body).toBe('2 walks (3 dogs), 1 visit (1 cat), boarding for 1 dog and 1 appointment today.');
    expect(doc.linkKind).toBe('bookingsDay');
    expect(String(doc.linkId)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(markDigestSent).toHaveBeenCalledWith(doc.linkId);
  });
});
