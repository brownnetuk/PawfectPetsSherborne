import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditEventType } from '../audit-log/schemas/audit-log-entry.schema';
import { Booking } from '../bookings/schemas/booking.schema';
import { Customer } from '../customers/schemas/customer.schema';
import { describeAnimalChanges } from './audit-diff.util';
import { CreateAnimalDto } from './dto/create-animal.dto';
import { PublicUpdateAnimalDto } from './dto/public-update-animal.dto';
import { UpdateAnimalDto } from './dto/update-animal.dto';
import { Animal, Species } from './schemas/animal.schema';

// Nested-populate shape for a `linkedAnimal` reference -- just enough for the
// admin UI to show "Linked to <customer name>" without a second round trip.
const LINKED_ANIMAL_POPULATE = { path: 'linkedAnimal', select: 'customer name', populate: { path: 'customer', select: 'name' } };

@Injectable()
export class AnimalsService {
  constructor(
    @InjectModel(Animal.name) private readonly animalModel: Model<Animal>,
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
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
    // A whole-collection fetch (no customer) is only ever used for pickers and
    // labels -- the bookings calendar and customer-by-pet search -- so return a
    // light projection without the heavy base64 image fields (photos,
    // vaccineRecordPhoto). A customer-scoped fetch (the pet detail view) keeps
    // the full document so it can render the images.
    if (!customerId) {
      return this.animalModel.find().select('name species customer').exec();
    }
    return this.animalModel.find({ customer: customerId }).populate(LINKED_ANIMAL_POPULATE).exec();
  }

  async findOne(id: string): Promise<Animal> {
    const animal = await this.animalModel.findById(id).populate(LINKED_ANIMAL_POPULATE).exec();
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
    const fieldChanges = describeAnimalChanges(dto, before);
    const description = [fieldChanges, photoChange ? `${animal.name} - Photos - ${photoChange}` : undefined]
      .filter(Boolean)
      .join('\n');
    await this.auditLogService.record(
      animal.customer,
      AuditEventType.ANIMAL_UPDATED,
      'Pet updated',
      description || `${animal.name} updated`,
      undefined,
      actor,
    );
    if (animal.linkedAnimal) {
      await this.propagateToLinkedAnimal(animal, dto, actor);
    }
    return animal;
  }

  // Mirrors an edit onto the OTHER half of a copy/copy pair (see
  // Animal.linkedAnimal's doc comment) -- applied with the exact same
  // findByIdAndUpdate() semantics as the edit that triggered it, minus
  // `customer`/`linkedAnimal` themselves, which must never follow a sync (the
  // whole point is two records under two different customers, each with its
  // own, independent link pointer). Silently a no-op if the counterpart was
  // since deleted -- remove() already clears a stale pointer on delete, but a
  // request already in flight when that happens shouldn't also fail its own,
  // otherwise-valid update.
  private async propagateToLinkedAnimal(
    animal: Animal,
    dto: Partial<CreateAnimalDto> | PublicUpdateAnimalDto,
    actor: string,
  ): Promise<void> {
    const { customer: _customer, ...syncableDto } = dto as Record<string, unknown>;
    const linked = await this.animalModel.findByIdAndUpdate(animal.linkedAnimal, syncableDto, { new: true }).exec();
    if (!linked) return;
    await this.auditLogService.record(
      linked.customer,
      AuditEventType.ANIMAL_UPDATED,
      'Pet updated',
      `${linked.name} updated automatically to match its linked copy`,
      undefined,
      actor,
    );
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
    const fieldChanges = describeAnimalChanges(dto, existing);
    const description = [fieldChanges, photoChange ? `${animal.name} - Photos - ${photoChange}` : undefined]
      .filter(Boolean)
      .join('\n');
    await this.auditLogService.record(
      customerId,
      AuditEventType.ANIMAL_UPDATED,
      'Pet updated',
      description || `${animal.name} updated`,
      undefined,
      actor,
    );
    if (animal.linkedAnimal) {
      await this.propagateToLinkedAnimal(animal, dto, actor);
    }
    return animal;
  }

  // Copies a pet to another customer -- a brand-new Animal document with the
  // same field values, linked bidirectionally to the source (see
  // Animal.linkedAnimal's doc comment) so future edits to either stay in
  // sync. Rejected if the source is already linked -- this models a single
  // copy/copy pair, not a multi-way sync group.
  async copyToCustomer(id: string, customerId: string, actor = 'Staff'): Promise<Animal> {
    const source = await this.animalModel.findById(id).exec();
    if (!source) throw new NotFoundException(`Animal ${id} not found`);
    if (source.linkedAnimal) {
      throw new BadRequestException('This pet is already linked to a copy under another customer. Unlink it first.');
    }
    if (source.customer.toString() === customerId) {
      throw new BadRequestException('This pet already belongs to that customer.');
    }
    const target = await this.customerModel.findById(customerId).exec();
    if (!target) throw new NotFoundException(`Customer ${customerId} not found`);

    const { _id, createdAt, updatedAt, __v, linkedAnimal, customer, ...fields } = source.toObject() as unknown as Record<
      string,
      unknown
    >;
    const copy = await new this.animalModel({ ...fields, customer: customerId, linkedAnimal: source._id }).save();
    await this.animalModel.findByIdAndUpdate(source._id, { linkedAnimal: copy._id }).exec();

    await this.auditLogService.record(
      customerId,
      AuditEventType.ANIMAL_CREATED,
      'Pet added',
      `${copy.name} copied from a pet linked to another customer`,
      undefined,
      actor,
    );
    await this.auditLogService.record(
      source.customer,
      AuditEventType.ANIMAL_UPDATED,
      'Pet linked',
      `${source.name} linked to a copy added under another customer`,
      undefined,
      actor,
    );
    return copy;
  }

  // Reassigns a pet to another customer outright -- same document, same id,
  // just a different owner. Unlike copyToCustomer, this doesn't touch
  // linkedAnimal at all: if the pet was already linked to a copy elsewhere,
  // that link (and the sync it drives) carries on exactly as before, just
  // under its new owner.
  async moveToCustomer(id: string, customerId: string, actor = 'Staff'): Promise<Animal> {
    const animal = await this.animalModel.findById(id).exec();
    if (!animal) throw new NotFoundException(`Animal ${id} not found`);
    if (animal.customer.toString() === customerId) {
      throw new BadRequestException('This pet already belongs to that customer.');
    }
    const target = await this.customerModel.findById(customerId).exec();
    if (!target) throw new NotFoundException(`Customer ${customerId} not found`);

    const fromCustomerId = animal.customer;
    animal.customer = customerId as unknown as typeof animal.customer;
    await animal.save();

    await this.auditLogService.record(
      fromCustomerId,
      AuditEventType.ANIMAL_UPDATED,
      'Pet moved',
      `${animal.name} moved to another customer`,
      undefined,
      actor,
    );
    await this.auditLogService.record(
      customerId,
      AuditEventType.ANIMAL_UPDATED,
      'Pet moved',
      `${animal.name} moved from another customer`,
      undefined,
      actor,
    );
    return animal;
  }

  // Breaks a copy/copy link both ways -- the counterpart (if it still exists)
  // becomes a normal, independent record rather than cascading the unlink
  // into a delete.
  async unlink(id: string, actor = 'Staff'): Promise<Animal> {
    const animal = await this.animalModel.findById(id).exec();
    if (!animal) throw new NotFoundException(`Animal ${id} not found`);
    if (!animal.linkedAnimal) {
      throw new BadRequestException('This pet is not linked to a copy under another customer.');
    }
    const counterpartId = animal.linkedAnimal;
    animal.linkedAnimal = undefined;
    await animal.save();
    const counterpart = await this.animalModel.findByIdAndUpdate(counterpartId, { $unset: { linkedAnimal: 1 } }).exec();

    await this.auditLogService.record(
      animal.customer,
      AuditEventType.ANIMAL_UPDATED,
      'Pet unlinked',
      `${animal.name} unlinked from its copy under another customer`,
      undefined,
      actor,
    );
    if (counterpart) {
      await this.auditLogService.record(
        counterpart.customer,
        AuditEventType.ANIMAL_UPDATED,
        'Pet unlinked',
        `${counterpart.name} unlinked from its copy under another customer`,
        undefined,
        actor,
      );
    }
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
    // The deleted animal's own linkedAnimal pointer goes with it -- but its
    // counterpart's pointer back would otherwise dangle, so clear that side
    // too, leaving it as a normal, independent record (see Animal.linkedAnimal's
    // doc comment on why this doesn't cascade into deleting the counterpart).
    if (result.linkedAnimal) {
      await this.animalModel.findByIdAndUpdate(result.linkedAnimal, { $unset: { linkedAnimal: 1 } }).exec();
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
