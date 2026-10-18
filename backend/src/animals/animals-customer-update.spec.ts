import { BadRequestException } from '@nestjs/common';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Booking } from '../bookings/schemas/booking.schema';
import { Customer } from '../customers/schemas/customer.schema';
import { AnimalsService } from './animals.service';
import { PublicUpdateAnimalDto } from './dto/public-update-animal.dto';
import { Animal, LeadMode, Species } from './schemas/animal.schema';

// updateForCustomer (portal + intake review): what actually reaches Mongo.
describe('AnimalsService.updateForCustomer', () => {
  let existing: Record<string, unknown>;
  let sent: Record<string, unknown> | undefined;
  let service: AnimalsService;

  beforeEach(() => {
    sent = undefined;
    existing = {
      _id: 'a1',
      customer: { toString: () => 'c1' },
      name: 'Rex',
      species: Species.DOG,
      chasesLivestock: 'no',
      offLeadConsent: { mode: LeadMode.OFF_LEAD, signature: 'data:old' },
    };
    const animalModel = {
      findById: () => ({ exec: () => Promise.resolve(existing) }),
      findByIdAndUpdate: (_id: string, update: Record<string, unknown>) => {
        sent = update;
        return { exec: () => Promise.resolve({ ...existing, ...update }) };
      },
    };
    service = new AnimalsService(
      animalModel as unknown as Model<Animal>,
      {} as Model<Booking>,
      {} as Model<Customer>,
      { record: () => Promise.resolve() } as unknown as AuditLogService,
    );
  });

  const update = (dto: Partial<PublicUpdateAnimalDto>) =>
    service.updateForCustomer('a1', 'c1', dto as PublicUpdateAnimalDto);

  it('stamps a newly signed off-lead consent', async () => {
    await update({
      offLeadConsent: { mode: LeadMode.OFF_LEAD, signature: 'data:new' },
    });
    expect(sent?.offLeadConsent).toMatchObject({
      mode: LeadMode.OFF_LEAD,
      signature: 'data:new',
      acknowledgedAt: expect.any(Date),
    });
  });

  it('drops the signature when consent is revoked to on-lead', async () => {
    await update({
      offLeadConsent: { mode: LeadMode.ON_LEAD, signature: 'data:stale' },
    });
    expect(sent?.offLeadConsent).toEqual({
      mode: LeadMode.ON_LEAD,
      acknowledgedAt: expect.any(Date),
      date: expect.any(Date),
    });
  });

  it('clears dog-only answers when species changes to cat', async () => {
    await update({ species: Species.CAT });
    expect(sent?.$unset).toEqual(
      expect.objectContaining({
        offLeadConsent: '',
        chasesLivestock: '',
        travelsWellInCar: '',
      }),
    );
  });

  it('leaves everything else alone when species is unchanged', async () => {
    await update({ name: 'Rexy' });
    expect(sent).toEqual({ name: 'Rexy' });
  });

  it('rejects a dog-only answer for an existing cat', async () => {
    existing.species = Species.CAT;
    await expect(
      update({ chasesLivestock: 'yes' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
