import { Types } from 'mongoose';
import { NotificationService } from './notification.service';

// A notification can carry a link to what it's about (linkKind + linkId),
// stored on the feed item and sent in the push payload, so the staff app can
// open the invoice / message / checklist straight from the tap.
describe('staff notification links', () => {
  const push = { sendToAll: jest.fn(), setBadgeOnAll: jest.fn() };
  const itemId = new Types.ObjectId();
  const itemModel = {
    create: jest.fn(async (_doc: Record<string, unknown>) => ({ _id: itemId })),
    countDocuments: jest.fn(() => ({ exec: async () => 1 })),
  };
  // Every toggle on, so the notify* helpers actually dispatch.
  const settings = { invoicesRead: true, invoicesOverdue: true, customerActivated: true };
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService(
      push as never,
      { get: async () => settings } as never,
      {} as never,
      {} as never,
      {} as never,
      itemModel as never,
      {} as never,
    );
  });

  it('stores the link on the feed item and sends it with the push', async () => {
    await service.dispatch('New message', 'Jane: hi', 'message', { kind: 'message', id: 'cust1' });
    expect(itemModel.create).toHaveBeenCalledWith({
      title: 'New message',
      body: 'Jane: hi',
      type: 'message',
      linkKind: 'message',
      linkId: 'cust1',
    });
    expect(push.sendToAll).toHaveBeenCalledWith(
      'New message',
      'Jane: hi',
      { type: 'message', notificationId: String(itemId), linkKind: 'message', linkId: 'cust1' },
      1,
    );
  });

  it('leaves the link out when there is nowhere to go', async () => {
    await service.dispatch("Today's schedule", '2 visits today.', 'dailyDigest');
    expect(itemModel.create).toHaveBeenCalledWith({ title: "Today's schedule", body: '2 visits today.', type: 'dailyDigest' });
    expect(push.sendToAll.mock.calls[0][2]).toEqual({ type: 'dailyDigest', notificationId: String(itemId) });
  });

  it('links invoice read to the invoice, checklist due to the assignment, overdue to the filtered list', async () => {
    await service.notifyInvoiceRead('INV00042', undefined, 'inv1');
    await service.notifyChecklistDue('Morning round', '10:00', 2, 'asg1');
    await service.notifyInvoicesOverdue(3);
    await service.notifyPreCheckInCompleted('BK00010', 'Jane', ['Rex'], 'bk1');
    await service.notifyCustomerActivated('Jane', 'cust1');
    const links = itemModel.create.mock.calls.map(([doc]) => [doc.linkKind, doc.linkId]);
    expect(links).toEqual([
      ['invoice', 'inv1'],
      ['checklist', 'asg1'],
      ['invoices', 'overdue'],
      ['boardingBooking', 'bk1'],
      ['customer', 'cust1'],
    ]);
  });
});
