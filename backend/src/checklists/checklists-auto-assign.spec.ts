import { checklistSessionsFor } from '../day-bookings/day-bookings.service';
import { ChecklistsService } from './checklists.service';

describe('checklistSessionsFor', () => {
  it('counts a boarding middle day (no times) as both AM and PM', () => {
    expect(checklistSessionsFor({})).toEqual({ am: true, pm: true });
  });

  it('uses the drop-off time on a boarding arrival day', () => {
    expect(checklistSessionsFor({ dropOffTime: '09:30' })).toEqual({ am: true, pm: true });
    expect(checklistSessionsFor({ dropOffTime: '12:00' })).toEqual({ am: false, pm: true });
    expect(checklistSessionsFor({ dropOffTime: '15:00' })).toEqual({ am: false, pm: true });
  });

  it('uses the pick-up time on a boarding departure day', () => {
    expect(checklistSessionsFor({ pickUpTime: '10:00' })).toEqual({ am: true, pm: false });
    expect(checklistSessionsFor({ pickUpTime: '12:00' })).toEqual({ am: true, pm: false });
    expect(checklistSessionsFor({ pickUpTime: '16:00' })).toEqual({ am: true, pm: true });
  });

  it('uses the AM/PM periods for day care when no time is given', () => {
    expect(checklistSessionsFor({ dropOffPeriod: 'AM', collectionPeriod: 'PM' })).toEqual({ am: true, pm: true });
    expect(checklistSessionsFor({ dropOffPeriod: 'AM', collectionPeriod: 'AM' })).toEqual({ am: true, pm: false });
    expect(checklistSessionsFor({ dropOffPeriod: 'PM', collectionPeriod: 'PM' })).toEqual({ am: false, pm: true });
  });

  it('prefers an actual day care time over its period', () => {
    expect(
      checklistSessionsFor({ dropOffPeriod: 'AM', dropOffTime: '08:00', collectionPeriod: 'PM', collectionTime: '11:45' }),
    ).toEqual({ am: true, pm: false });
  });
});

describe('ChecklistsService.autoAssignForDate', () => {
  const date = new Date(2026, 9, 24);
  const templates = [
    { _id: 'am', session: 'AM', category: 'boarding', name: 'Daily Checklist - AM', items: ['Feed'] },
    { _id: 'pm', session: 'PM', category: 'boarding', name: 'Daily Checklist - PM', items: ['Feed'] },
    { _id: 'all', session: 'allDay', category: 'boarding', name: 'Cleaning', items: ['Mop'] },
    { _id: 'legacy', category: 'boarding', name: 'Old template', items: ['Water'] },
  ];

  function setup(existing: string[] = []) {
    const saved: string[] = [];
    const templateModel = { find: jest.fn(() => ({ exec: () => Promise.resolve(templates) })) };
    const assignmentModel = Object.assign(
      jest.fn((doc: { template: string }) => ({
        save: () => {
          saved.push(doc.template);
          return Promise.resolve(doc);
        },
      })),
      { exists: jest.fn(({ template }: { template: string }) => Promise.resolve(existing.includes(template))) },
    );
    const service = new ChecklistsService(templateModel as never, assignmentModel as never);
    return { service, saved };
  }

  it('adds AM, PM and all-day checklists on a full day', async () => {
    const { service, saved } = setup();
    await service.autoAssignForDate(date, 'boarding', { am: true, pm: true });
    expect(saved).toEqual(['am', 'pm', 'all', 'legacy']);
  });

  it('adds only the PM (and all-day) checklists on an afternoon arrival day', async () => {
    const { service, saved } = setup();
    await service.autoAssignForDate(date, 'boarding', { am: false, pm: true });
    expect(saved).toEqual(['pm', 'all', 'legacy']);
  });

  it('adds only the AM (and all-day) checklists on a morning departure day', async () => {
    const { service, saved } = setup();
    await service.autoAssignForDate(date, 'boarding', { am: true, pm: false });
    expect(saved).toEqual(['am', 'all', 'legacy']);
  });

  it('never duplicates a checklist already on that day', async () => {
    const { service, saved } = setup(['am', 'all']);
    await service.autoAssignForDate(date, 'boarding', { am: true, pm: true });
    expect(saved).toEqual(['pm', 'legacy']);
  });
});
