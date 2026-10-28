import { InvoiceStatus } from '../invoices/schemas/invoice.schema';
import { BoardingBookingsService } from './boarding-bookings.service';
import type { BoardingBooking } from './schemas/boarding-booking.schema';
import type { Invoice } from '../invoices/schemas/invoice.schema';

// Only its name is used (for @InjectModel) -- see booking-incident-reports.service.spec.ts.
jest.mock('./schemas/boarding-booking.schema', () => ({ BoardingBooking: { name: 'BoardingBooking' } }));

// computeStages()/statusLabel() are pure functions of the booking + invoice,
// so none of the constructor's dependencies are needed.
describe('BoardingBookingsService stages', () => {
  const service = new (BoardingBookingsService as unknown as new (...args: unknown[]) => BoardingBookingsService)();
  const invoice = { status: InvoiceStatus.DRAFT, amountPaid: 0, invoiceNumber: 'INV00026' } as unknown as Invoice;
  const base = { invoice: 'inv', preCheckInSentAt: new Date(), preCheckInSubmission: 'sub' };
  const stage = (b: Partial<BoardingBooking>, key: string) =>
    service.computeStages(b as unknown as BoardingBooking, invoice).find((s) => s.key === key)!;

  it('does not tick pre-check-in when the link has only been sent', () => {
    const b = { ...base } as unknown as BoardingBooking;
    expect(stage(b, 'preCheckIn')).toMatchObject({ done: false, sub: 'Sent' });
    expect(service.statusLabel(b, invoice)).toBe('Invoice Raised - Draft');
  });

  it('ticks a completed pre-check-in despite an earlier "Deposit Not Required" pin', () => {
    const b = { ...base, preCheckInCompletedAt: new Date(), statusOverride: 'Deposit Not Required' } as unknown as BoardingBooking;
    const stages = service.computeStages(b, invoice);
    expect(stages.find((s) => s.key === 'paymentReceived')).toMatchObject({ done: true, label: 'Deposit Not Required' });
    expect(stages.find((s) => s.key === 'preCheckIn')).toMatchObject({ done: true, current: false });
    expect(stages.find((s) => s.key === 'checkedIn')).toMatchObject({ done: false, current: true });
    expect(service.statusLabel(b, invoice)).toBe('Pre Check In Complete');
  });

  it('keeps a "Deposit Not Required" pin while the pre-check-in is still outstanding', () => {
    const b = { ...base, statusOverride: 'Deposit Not Required' } as unknown as BoardingBooking;
    expect(stage(b, 'preCheckIn')).toMatchObject({ done: false, current: true });
    expect(service.statusLabel(b, invoice)).toBe('Deposit Not Required');
  });
});
