import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateAnimalDto } from './dto/create-animal.dto';
import { PublicUpdateAnimalDto } from './dto/public-update-animal.dto';
import { UpdateAnimalDto } from './dto/update-animal.dto';
import { Animal, Species } from './schemas/animal.schema';

@Injectable()
export class AnimalsService {
  constructor(@InjectModel(Animal.name) private readonly animalModel: Model<Animal>) {}

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

  create(dto: CreateAnimalDto): Promise<Animal> {
    this.validateOffLeadConsent(dto, true);
    const payload = {
      ...dto,
      offLeadConsent:
        dto.species === Species.DOG && dto.offLeadConsent
          ? { ...dto.offLeadConsent, acknowledgedAt: new Date(), date: new Date() }
          : undefined,
    };
    return new this.animalModel(payload).save();
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

  async update(id: string, dto: UpdateAnimalDto): Promise<Animal> {
    this.validateOffLeadConsent(dto, false);
    const animal = await this.animalModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!animal) {
      throw new NotFoundException(`Animal ${id} not found`);
    }
    return animal;
  }

  // Backs the public, customer-scoped update route: the intake form's "review my
  // existing pets" flow, not staff editing (that goes through the plain update()
  // above). Ownership is checked against the animal's own `customer` field rather
  // than trusted from the request -- PublicUpdateAnimalDto has no `customer` field
  // at all, so there's nothing here for a caller to reassign.
  async updateForCustomer(id: string, customerId: string, dto: PublicUpdateAnimalDto): Promise<Animal> {
    const existing = await this.animalModel.findById(id).exec();
    if (!existing || existing.customer.toString() !== customerId) {
      throw new NotFoundException(`Animal ${id} not found`);
    }
    this.validateOffLeadConsent(dto, false);
    const animal = await this.animalModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!animal) {
      throw new NotFoundException(`Animal ${id} not found`);
    }
    return animal;
  }

  async remove(id: string): Promise<void> {
    const result = await this.animalModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Animal ${id} not found`);
    }
  }
}
