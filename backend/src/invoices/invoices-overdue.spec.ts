import { daysOverdue, overdueCutoff } from './invoices.service';

// An invoice is on time throughout its due date and only becomes overdue the
// day after -- markOverdue() flips `sent` invoices whose dueDate is at or
// before this cutoff.
describe('overdueCutoff', () => {
  const dueDate = new Date('2026-10-20T00:00:00.000Z');

  it('does not catch an invoice on its due date', () => {
    const duringDueDay = new Date('2026-10-20T15:00:00.000Z');
    expect(dueDate <= overdueCutoff(duringDueDay)).toBe(false);
  });

  it('does not catch an invoice just before the day after its due date', () => {
    const lastMinute = new Date('2026-10-20T23:59:59.000Z');
    expect(dueDate <= overdueCutoff(lastMinute)).toBe(false);
  });

  it('catches an invoice from the start of the day after its due date', () => {
    const dayAfter = new Date('2026-10-21T00:00:00.000Z');
    expect(dueDate <= overdueCutoff(dayAfter)).toBe(true);
  });

  it('is exactly one day before now', () => {
    const now = new Date('2026-10-24T09:30:00.000Z');
    expect(overdueCutoff(now).toISOString()).toBe('2026-10-23T09:30:00.000Z');
  });
});

// The "{{days_overdue}}" placeholder on the payment_overdue reminder email.
describe('daysOverdue', () => {
  const dueDate = new Date('2026-10-20T00:00:00.000Z');

  it('is 0 on the due date itself', () => {
    expect(daysOverdue(dueDate, new Date('2026-10-20T18:00:00.000Z'))).toBe(0);
  });

  it('is 0 before the due date', () => {
    expect(daysOverdue(dueDate, new Date('2026-10-15T09:00:00.000Z'))).toBe(0);
  });

  it('counts calendar days after the due date, regardless of time of day', () => {
    expect(daysOverdue(dueDate, new Date('2026-10-21T00:00:01.000Z'))).toBe(1);
    expect(daysOverdue(dueDate, new Date('2026-10-28T23:59:00.000Z'))).toBe(8);
  });
});
