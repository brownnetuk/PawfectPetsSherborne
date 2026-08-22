import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import { Booking } from '../bookings/schemas/booking.schema';
import { CreateAnimalDto } from './dto/create-animal.dto';
import { PublicUpdateAnimalDto } from './dto/public-update-animal.dto';
import { UpdateAnimalDto } from './dto/update-animal.dto';
import { Animal, Species } from './schemas/animal.schema';

@Injectable()
export class AnimalsService {
  constructor(
    @InjectModel(Animal.name) private readonly animalModel: Model<Animal>,
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    private readonly auditLogService: AuditLogService,
  ) {}

  // `requireForDogs` only applies on create: a dog must be registered with off-lead
  // consent up front. On update, most edits (e.g. this admin form) never touch
  // offLeadConsent at all and shouldn't be forced to resupply it just because
  // species=dog was resent alongside unrelated field changes — the existing
  // subdocument is left untouched by Mongo when the key is simply absent.
  private validateOffLeadConsent(dto: Partial<CreateAnimalDto>, requireForDogs: boolean) {
    if (dto.species && dto.species !== Species.DOG && dto.offLeadConsent) {
      throw new BadRequestException('Off-lead consent only applies to dogs');
    }
    if (requireForDogs && dto.species === Species.DOG && !dto.offLeadConsent) {
      throw new BadRequestException('Off-lead consent (on lead / off lead) is required for dogs');
    }
  }

  // Cats don't chase livestock, aren't assessed for aggression to other animals or
  // car travel; only dogs are assessed for chasing livestock at all.
  private validateSpeciesFields(dto: Partial<CreateAnimalDto>) {
    if (dto.species === Species.CAT) {
      if (dto.chasesLivestock || dto.aggressionToOtherAnimals !== undefined || dto.travelsWellInCar) {
        throw new BadRequestException(
          'Chases livestock, aggression to other animals, and travels well in car do not apply to cats',
        );
      }
    }
    if (dto.species === Species.OTHER && dto.chasesLivestock) {
      throw new BadRequestException('Chases livestock only applies to dogs');
    }
  }

  // Only called when the incoming payload actually included `photos` -- an edit
  // that doesn't touch photos at all shouldn't claim they changed. Compared by
  // value (not just count) so a same-count swap (remove one, add another in the
  // same edit) is still reported rather than silently passing as "no change".
  private describePhotoChange(before: string[] | undefined, after: string[] | undefined): string | undefined {
    const beforeList = before ?? [];
    const afterList = after ?? [];
    if (JSON.stringify(beforeList) === JSON.stringify(afterList)) {
      return undefined;
    }
    const diff = afterList.length - beforeList.length;
    if (diff > 0) {
      return diff === 1 ? 'photo added' : `${diff} photos added`;
    }
    if (diff < 0) {
      return -diff === 1 ? 'photo removed' : `${-diff} photos removed`;
    }
    return 'photos changed';
  }

  async create(dto: CreateAnimalDto, actor = 'Customer'): Promise<Animal> {
    this.validateOffLeadConsent(dto, true);
    this.validateSpeciesFields(dto);
    const payload = {
      ...dto,
      offLeadConsent:
        dto.species === Species.DOG && dto.offLeadConsent
          ? { ...dto.offLeadConsent, acknowledgedAt: new Date(), date: new Date() }
          : undefined,
    };
    const created = await new this.animalModel(payload).save();
    await this.auditLogService.record(
      created.customer,
      AuditEventType.ANIMAL_CREATED,
      'Pet added',
      `${created.name} added`,
      undefined,
      actor,
    );
    return created;
  }

  findAll(customerId?: string): Promise<Animal[]> {
    const filter = customerId ? { customer: customerId } : {};
    return this.animalModel.find(filter).exec();
  }

  async findOne(id: string): Promise<Animal> {
    const animal = await this.animalModel.findById(id).exec();
    if (!animal) {
      throw new NotFoundException(`Animal ${id} not found`);
    }
    return animal;
  }

  async update(id: string, dto: UpdateAnimalDto, actor = 'Staff'): Promise<Animal> {
    this.validateOffLeadConsent(dto, false);
    this.validateSpeciesFields(dto);
    const before = await this.animalModel.findById(id).exec();
    if (!before) {
      throw new NotFoundException(`Animal ${id} not found`);
    }
    const animal = await this.animalModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!animal) {
      throw new NotFoundException(`Animal ${id} not found`);
    }
    const photoChange = dto.photos !== undefined ? this.describePhotoChange(before.photos, animal.photos) : undefined;
    await this.auditLogService.record(
      animal.customer,
      AuditEventType.ANIMAL_UPDATED,
      'Pet updated',
      photoChange ? `${animal.name} updated — ${photoChange}` : `${animal.name} updated`,
      undefined,
      actor,
    );
    return animal;
  }

  // Backs the public, customer-scoped update route: the intake form's "review my
  // existing pets" flow, not staff editing (that goes through the plain update()
  // above). Ownership is checked against the animal's own `customer` field rather
  // than trusted from the request -- PublicUpdateAnimalDto has no `customer` field
  // at all, so there's nothing here for a caller to reassign.
  async updateForCustomer(
    id: string,
    customerId: string,
    dto: PublicUpdateAnimalDto,
    actor = 'Customer',
  ): Promise<Animal> {
    const existing = await this.animalModel.findById(id).exec();
    if (!existing || existing.customer.toString() !== customerId) {
      throw new NotFoundException(`Animal ${id} not found`);
    }
    this.validateOffLeadConsent(dto, false);
    this.validateSpeciesFields(dto);
    const animal = await this.animalModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!animal) {
      throw new NotFoundException(`Animal ${id} not found`);
    }
    const photoChange =
      dto.photos !== undefined ? this.describePhotoChange(existing.photos, animal.photos) : undefined;
    await this.auditLogService.record(
      customerId,
      AuditEventType.ANIMAL_UPDATED,
      'Pet updated',
      photoChange ? `${animal.name} updated — ${photoChange}` : `${animal.name} updated`,
      undefined,
      actor,
    );
    return animal;
  }

  async remove(id: string, actor = 'Staff'): Promise<void> {
    const bookingCount = await this.bookingModel.countDocuments({ animals: id }).exec();
    if (bookingCount > 0) {
      throw new ConflictException(
        `Can't delete this pet: it's on ${bookingCount} booking${bookingCount === 1 ? '' : 's'}. Remove or reassign ${bookingCount === 1 ? 'that booking' : 'those bookings'} first.`,
      );
    }
    const result = await this.animalModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Animal ${id} not found`);
    }
    await this.auditLogService.record(
      result.customer,
      AuditEventType.ANIMAL_REMOVED,
      'Pet removed',
      `${result.name} removed`,
      undefined,
      actor,
    );
  }
}
