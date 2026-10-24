import { checklistDueAt, checklistReminderDue } from './checklists.service';

// The "due in an hour and not finished" reminder's timing rule. Dates are
// built in local time because that's how assignments store their day and
// how completeByTime is read (same as the daily digest).
describe('checklist due reminders', () => {
  const day = new Date(2026, 9, 24); // 24 Oct 2026, local midnight
  const tenAm = { date: day, completeByTime: '10:00' };

  it('resolves the due instant from the day and complete-by time', () => {
    expect(checklistDueAt(tenAm)).toEqual(new Date(2026, 9, 24, 10, 0));
  });

  it('has no due instant without a valid complete-by time', () => {
    expect(checklistDueAt({ date: day })).toBeNull();
    expect(checklistDueAt({ date: day, completeByTime: '' })).toBeNull();
    expect(checklistDueAt({ date: day, completeByTime: 'ten' })).toBeNull();
  });

  it('is not due more than an hour before the complete-by time', () => {
    expect(checklistReminderDue(tenAm, new Date(2026, 9, 24, 8, 59))).toBe(false);
  });

  it('is due from exactly an hour before', () => {
    expect(checklistReminderDue(tenAm, new Date(2026, 9, 24, 9, 0))).toBe(true);
    expect(checklistReminderDue(tenAm, new Date(2026, 9, 24, 9, 30))).toBe(true);
  });

  it('is still due once the complete-by time has passed (a late reminder beats none)', () => {
    expect(checklistReminderDue(tenAm, new Date(2026, 9, 24, 10, 30))).toBe(true);
  });

  it('is never due twice', () => {
    expect(checklistReminderDue({ ...tenAm, reminderSentAt: new Date() }, new Date(2026, 9, 24, 9, 30))).toBe(false);
  });

  it('ignores a checklist with no complete-by time', () => {
    expect(checklistReminderDue({ date: day }, new Date(2026, 9, 24, 23, 59))).toBe(false);
  });

  it('is scoped to the assigned day, not any day the template has a time', () => {
    // Yesterday's assignment with the same time is well past due (so "due"),
    // but the cron only queries today's assignments -- this check documents
    // that the day comes from the assignment itself.
    const yesterday = { date: new Date(2026, 9, 23), completeByTime: '10:00' };
    expect(checklistDueAt(yesterday)).toEqual(new Date(2026, 9, 23, 10, 0));
  });
});
