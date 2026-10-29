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
    const dayBookingModel = {
      findById: jest.fn(() => exec(before)),
      findByIdAndUpdate: jest.fn(() => chain(after)),
      findByIdAndDelete: jest.fn(() => exec(before)),
    };
    const visitMappingModel = { findOne: jest.fn(() => exec({})) };
    const productModel = {
      find: jest.fn(() =>
        chain([
          { _id: 'walk30', name: '30 Minute Walk', price: 12 },
          { _id: 'walk60', name: '60 Minute Walk', price: 20 },
        ]),
      ),
    };
    const customerModel = { findById: jest.fn(() => chain({ travelChargeable: false })) };
    const invoiceModel = {
      findById: jest.fn(() =>
        exec({
          _id: 'inv1',
          status,
          lineItems: [{ description: '30 Minute Walk', quantity: 4, unitPrice: 12, discountPercent: 0 }],
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
    return { service, invoices };
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
      { lineItems: [{ description: '30 Minute Walk', quantity: 3, unitPrice: 12, discountPercent: 0 }] },
      'System',
    );
  });
});
