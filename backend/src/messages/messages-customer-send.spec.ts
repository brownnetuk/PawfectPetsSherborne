import { MessagesService } from './messages.service';

// A customer message is signed with the name of whoever actually wrote it:
// the customer, or an additional user (Mobile App Access) by their configured
// name. Staff are told both names when they differ.
describe('MessagesService.customerSend', () => {
  const customer = {
    _id: 'cust1',
    name: 'Jane Doe',
    portalUsers: [
      { _id: { toString: () => 'user1' }, name: 'Sam Doe', email: 'sam@example.com' },
      { _id: { toString: () => 'user2' }, name: '  ', email: 'blank@example.com' },
    ],
  };
  let created: Record<string, unknown>[];
  let dispatched: string[];
  let selected: string | undefined;
  let service: MessagesService;

  beforeEach(() => {
    created = [];
    dispatched = [];
    selected = undefined;
    const customerModel = {
      findById: () => ({
        select: (fields: string) => {
          selected = fields;
          return { exec: async () => customer };
        },
      }),
    };
    const messageModel = {
      create: async (doc: Record<string, unknown>) => {
        created.push(doc);
        return doc;
      },
    };
    const notifications = {
      dispatch: async (_title: string, body: string) => {
        dispatched.push(body);
      },
    };
    service = new MessagesService(
      messageModel as never,
      customerModel as never,
      {} as never,
      notifications as never,
    );
  });

  it('signs the customer\'s own message with the customer name', async () => {
    await service.customerSend('cust1', 'Hello');
    expect(created[0]).toMatchObject({ senderName: 'Jane Doe', portalUser: undefined });
    expect(dispatched[0]).toBe('Jane Doe: Hello');
  });

  it('signs an additional user\'s message with their configured name', async () => {
    await service.customerSend('cust1', 'Hello', 'user1');
    expect(selected).toBe('+portalUsers');
    expect(created[0]).toMatchObject({ senderName: 'Sam Doe' });
    expect(String(created[0].portalUser)).toBe('user1');
    expect(dispatched[0]).toBe('Sam Doe (Jane Doe): Hello');
  });

  it('falls back to the customer name when the additional user has no name', async () => {
    await service.customerSend('cust1', 'Hello', 'user2');
    expect(created[0]).toMatchObject({ senderName: 'Jane Doe' });
    expect(String(created[0].portalUser)).toBe('user2');
  });

  it('ignores an id that is not one of the account\'s additional users', async () => {
    await service.customerSend('cust1', 'Hello', 'someone-else');
    expect(created[0]).toMatchObject({ senderName: 'Jane Doe', portalUser: undefined });
    expect(dispatched[0]).toBe('Jane Doe: Hello');
  });
});
