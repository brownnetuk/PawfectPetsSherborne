import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EncryptionService } from '../common/encryption/encryption.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer, CustomerStatus } from './schemas/customer.schema';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    private readonly encryptionService: EncryptionService,
  ) {}

  private validateEmergencyContact(dto: CreateCustomerDto) {
    const { emergencyContact } = dto;
    if (
      !emergencyContact.sameAsClient &&
      !emergencyContact.telephone &&
      !emergencyContact.mobile
    ) {
      throw new BadRequestException(
        'Emergency contact requires at least one of telephone or mobile',
      );
    }
    if (!emergencyContact.sameAsClient && (!emergencyContact.name || !emergencyContact.address)) {
      throw new BadRequestException(
        'Emergency contact name and address are required unless "same as client" is set',
      );
    }
  }

  private encryptSecurity(dto: CreateCustomerDto) {
    const { security } = dto;
    if (!security) return undefined;
    const { alarmInstructions, ...rest } = security;
    return {
      ...rest,
      alarmInstructionsEncrypted: alarmInstructions
        ? this.encryptionService.encrypt(alarmInstructions)
        : undefined,
    };
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    this.validateEmergencyContact(dto);
    if (!dto.emergencyVet.alternativeVetAuthorised) {
      throw new BadRequestException(
        'Alternative vet care authorisation must be acknowledged',
      );
    }

    const created = new this.customerModel({
      ...dto,
      security: this.encryptSecurity(dto),
      agreement: dto.agreement
        ? { ...dto.agreement, signedAt: new Date(), date: new Date() }
        : undefined,
      status: CustomerStatus.ACTIVE,
    });
    return created.save();
  }

  findAll(): Promise<Customer[]> {
    return this.customerModel.find().select('-security.alarmInstructionsEncrypted').exec();
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const update: Record<string, unknown> = { ...dto };
    if (dto.security) {
      update.security = this.encryptSecurity(dto as CreateCustomerDto);
    }
    const customer = await this.customerModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  async remove(id: string): Promise<void> {
    const result = await this.customerModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
  }

  /** Decrypts alarm instructions for authorised operational use (e.g. dispatching staff to the property). */
  async getAlarmInstructions(id: string): Promise<string | null> {
    const customer = await this.findOne(id);
    const ciphertext = customer.security?.alarmInstructionsEncrypted;
    return ciphertext ? this.encryptionService.decrypt(ciphertext) : null;
  }
}
