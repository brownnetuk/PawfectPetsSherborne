import { Types } from 'mongoose';
import { NotificationService } from './notification.service';

// Pre-check-in push and the app icon badge: every staff push carries the
// unread count as its badge, and reading notifications re-syncs the badge on
// every staff phone. Models and push are mocked -- nothing reaches APNs.
describe('staff notification badge', () => {
  let unread: number;
  let settings: Record<string, unknown>;
  const push = { sendToAll: jest.fn(), setBadgeOnAll: jest.fn() };
  const itemId = new Types.ObjectId();
  const itemModel = {
    create: jest.fn(async () => ({ _id: itemId })),
    countDocuments: jest.fn(() => ({ exec: async () => unread })),
    updateMany: jest.fn(() => ({ exec: async () => ({}) })),
    updateOne: jest.fn(() => ({ exec: async () => ({ modifiedCount: 1 }) })),
    deleteMany: jest.fn(() => ({ exec: async () => ({}) })),
  };
  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    unread = 3;
    settings = {};
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

  it('pushes a pre-check-in completed alert with the unread count as the badge', async () => {
    await service.notifyPreCheckInCompleted('BK00010', 'Jane Smith', ['Rex', 'Bella']);
    expect(itemModel.create).toHaveBeenCalledWith({
      title: 'Pre-check-in completed',
      body: 'Jane Smith completed the pre-check-in form for Rex and Bella (BK00010).',
      type: 'preCheckInCompleted',
    });
    expect(push.sendToAll).toHaveBeenCalledWith(
      'Pre-check-in completed',
      expect.any(String),
      { type: 'preCheckInCompleted', notificationId: String(itemId) },
      3,
    );
  });

  it('stays quiet when the pre-check-in toggle is off', async () => {
    settings = { preCheckInCompleted: false };
    await service.notifyPreCheckInCompleted('BK00010');
    expect(push.sendToAll).not.toHaveBeenCalled();
  });

  it('defaults on for settings saved before the toggle existed', async () => {
    await service.notifyPreCheckInCompleted('BK00010');
    expect(itemModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'A customer completed the pre-check-in form (BK00010).' }),
    );
  });

  it('re-syncs the badge on every phone when one notification is read', async () => {
    unread = 2;
    await service.markRead(String(itemId));
    expect(push.setBadgeOnAll).toHaveBeenCalledWith(2);
  });

  it('does not re-sync for an already-read or unknown id', async () => {
    itemModel.updateOne.mockReturnValueOnce({ exec: async () => ({ modifiedCount: 0 }) });
    await service.markRead(String(itemId));
    await service.markRead('not-an-id');
    expect(push.setBadgeOnAll).not.toHaveBeenCalled();
  });

  it('clears the badge when everything is marked read', async () => {
    unread = 0;
    await service.markAllRead();
    expect(push.setBadgeOnAll).toHaveBeenCalledWith(0);
  });
});
