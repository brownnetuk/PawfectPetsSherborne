import { formatUkDateTime } from './invoices.service';

// The time shown in the "Send scheduled" activity entry -- always UK time,
// whatever timezone the server container runs in.
describe('formatUkDateTime', () => {
  it('shows GMT times as-is in winter', () => {
    expect(formatUkDateTime(new Date('2026-11-03T09:30:00.000Z'))).toBe(
      '03/11/2026 09:30',
    );
  });

  it('shows BST times an hour ahead of UTC in summer', () => {
    expect(formatUkDateTime(new Date('2026-07-15T13:05:00.000Z'))).toBe(
      '15/07/2026 14:05',
    );
  });
});
