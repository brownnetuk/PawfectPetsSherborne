import { InvoiceStatus } from '../invoices/schemas/invoice.schema';
import { DayBookingsService } from './day-bookings.service';

// A walk already on an invoice is changed from 30 to 60 minutes (or
// deleted): the invoice's lines follow while it's Draft or Scheduled.
describe('DayBookingsService invoice line sync', () => {
  const exec = <T>(value: T) => ({ exec: () => Promise.resolve(value) });
  const chain = <T>(value: T) => {
    const q = { populate: () => q, select: () => q, exec: () => Promise.resolve(value) };
    return q;
  };

  function setup(status: InvoiceStatus, bookingInvoice: string | null = 'inv1') {
    const before = {
      _id: 'b1',
      product: 'walk30',
      quantity: 1,
      customer: 'c1',
      invoice: bookingInvoice ?? undefined,
      date: new Date(2026, 9, 29),
    };
    const after = { ...before, product: { _id: 'walk60', name: '60 Minute Walk', price: 20 } };
    // A two-day boarding stay on the same invoice, plus its pick-up placeholder.
    const stayRows = [
      { _id: 's1', product: 'board', quantity: 1, customer: 'c1', invoice: 'inv1', boardingStay: true },
      { _id: 's2', product: 'board', quantity: 1, customer: 'c1', invoice: 'inv1', boardingStay: true },
      { _id: 's3', product: 'board', quantity: 1, customer: 'c1', boardingStay: true, placeholder: true },
    ];
    const dayBookingModel = {
      findById: jest.fn(() => exec(before)),
      findByIdAndUpdate: jest.fn(() => chain(after)),
      findByIdAndDelete: jest.fn(() => exec(before)),
      find: jest.fn(() => exec(stayRows)),
      deleteMany: jest.fn(() => exec({ deletedCount: stayRows.length })),
      updateMany: jest.fn(() => exec({})),
    };
    const visitMappingModel = { findOne: jest.fn(() => exec({})) };
    const productModel = {
      find: jest.fn(() =>
        chain([
          { _id: 'walk30', name: '30 Minute Walk', price: 12 },
          { _id: 'walk60', name: '60 Minute Walk', price: 20 },
          { _id: 'board', name: 'Boarding Per Day', price: 40 },
        ]),
      ),
    };
    const customerModel = { findById: jest.fn(() => chain({ travelChargeable: false })) };
    const invoiceModel = {
      findById: jest.fn(() =>
        chain({
          _id: 'inv1',
          customer: 'c1',
          status,
          lineItems: [
            { description: '30 Minute Walk', quantity: 4, unitPrice: 12, discountPercent: 0 },
            { description: 'Boarding Per Day', quantity: 2, unitPrice: 40, discountPercent: 0 },
          ],
        }),
      ),
    };
    const invoices = { update: jest.fn(() => Promise.resolve({})) };
    const service = new DayBookingsService(
      dayBookingModel as never,
      null as never,
      visitMappingModel as never,
      { autoAssignForDate: jest.fn() } as never,
      productModel as never,
      customerModel as never,
      invoiceModel as never,
      invoices as never,
    );
    return { service, invoices, dayBookingModel };
  }

  it.each([InvoiceStatus.DRAFT, InvoiceStatus.SCHEDULED])('updates a %s invoice when the walk length changes', async (status) => {
    const { service, invoices } = setup(status);
    await service.update('b1', { product: 'walk60' });
    expect(invoices.update).toHaveBeenCalledWith(
      'inv1',
      {
        lineItems: [
          { description: '30 Minute Walk', quantity: 3, unitPrice: 12, discountPercent: 0 },
          { description: '60 Minute Walk', quantity: 1, unitPrice: 20, discountPercent: 0 },
          { description: 'Boarding Per Day', quantity: 2, unitPrice: 40, discountPercent: 0 },
        ],
      },
      'System',
    );
  });

  it.each([InvoiceStatus.SENT, InvoiceStatus.PAID, InvoiceStatus.OVERDUE])('leaves a %s invoice alone', async (status) => {
    const { service, invoices } = setup(status);
    await service.update('b1', { product: 'walk60' });
    expect(invoices.update).not.toHaveBeenCalled();
  });

  it('does nothing for a booking that is not invoiced', async () => {
    const { service, invoices } = setup(InvoiceStatus.DRAFT, null);
    await service.update('b1', { product: 'walk60' });
    expect(invoices.update).not.toHaveBeenCalled();
  });

  it('does nothing when the patch only links the booking to an invoice', async () => {
    const { service, invoices } = setup(InvoiceStatus.DRAFT);
    await service.update('b1', { invoice: 'inv1' });
    expect(invoices.update).not.toHaveBeenCalled();
  });

  it('takes a deleted walk off a draft invoice', async () => {
    const { service, invoices } = setup(InvoiceStatus.DRAFT);
    await service.remove('b1');
    expect(invoices.update).toHaveBeenCalledWith(
      'inv1',
      {
        lineItems: [
          { description: '30 Minute Walk', quantity: 3, unitPrice: 12, discountPercent: 0 },
          { description: 'Boarding Per Day', quantity: 2, unitPrice: 40, discountPercent: 0 },
        ],
      },
      'System',
    );
  });

  it('takes an edited stay off a draft invoice in one update, then adds the rebooked rows back', async () => {
    const { service, invoices, dayBookingModel } = setup(InvoiceStatus.DRAFT);
    await service.removeStay('stay1', { syncInvoice: true });
    expect(invoices.update).toHaveBeenCalledTimes(1);
    expect(invoices.update).toHaveBeenLastCalledWith(
      'inv1',
      { lineItems: [{ description: '30 Minute Walk', quantity: 4, unitPrice: 12, discountPercent: 0 }] },
      'System',
    );

    await service.attachToInvoice(['s1', 's2', 's3'], 'inv1');
    expect(dayBookingModel.updateMany).toHaveBeenCalledWith({ _id: { $in: ['s1', 's2'] } }, { invoice: 'inv1' });
    // The mock invoice still has its original lines, so both rows add on.
    expect(invoices.update).toHaveBeenLastCalledWith(
      'inv1',
      {
        lineItems: [
          { description: '30 Minute Walk', quantity: 4, unitPrice: 12, discountPercent: 0 },
          { description: 'Boarding Per Day', quantity: 4, unitPrice: 40, discountPercent: 0 },
        ],
      },
      'System',
    );
  });

  it('leaves the invoice alone when BoardingBookingsService removes a stay', async () => {
    const { service, invoices } = setup(InvoiceStatus.DRAFT);
    await service.removeStay('stay1');
    expect(invoices.update).not.toHaveBeenCalled();
  });

  it('re-links rebooked rows to a sent invoice without changing it', async () => {
    const { service, invoices, dayBookingModel } = setup(InvoiceStatus.SENT);
    await service.attachToInvoice(['s1', 's2'], 'inv1');
    expect(dayBookingModel.updateMany).toHaveBeenCalled();
    expect(invoices.update).not.toHaveBeenCalled();
  });
});
