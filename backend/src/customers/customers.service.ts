import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EncryptionService } from '../common/encryption/encryption.service';
import { CreateCustomerDto, EmergencyContactDto, EmergencyVetDto } from './dto/create-customer.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer, CustomerStatus } from './schemas/customer.schema';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    private readonly encryptionService: EncryptionService,
  ) {}

  private validateEmergencyContact(emergencyContact: EmergencyContactDto) {
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

  private validateEmergencyVet(emergencyVet: EmergencyVetDto) {
    if (!emergencyVet.alternativeVetAuthorised) {
      throw new BadRequestException('Alternative vet care authorisation must be acknowledged');
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
    this.validateEmergencyContact(dto.emergencyContact);
    this.validateEmergencyVet(dto.emergencyVet);

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

  /** Staff pre-create a minimal record; the public intake form link points at its id. */
  createLead(dto: CreateLeadDto): Promise<Customer> {
    const created = new this.customerModel({
      name: dto.name,
      email: dto.email,
      status: CustomerStatus.PENDING,
    });
    return created.save();
  }

  findAll(): Promise<Customer[]> {
    return this.customerModel
      .find()
      .select('-security.alarmInstructionsEncrypted')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    if (dto.emergencyContact) {
      this.validateEmergencyContact(dto.emergencyContact);
    }
    if (dto.emergencyVet) {
      this.validateEmergencyVet(dto.emergencyVet);
    }

    const { security, ...rest } = dto;
    const update: Record<string, unknown> = { ...rest };

    // Field-level ($set via dot notation) rather than replacing the whole `security`
    // subdocument: the client is never given the plaintext alarm instructions back, so
    // an edit that only touches e.g. keysProvided must not blow away the existing
    // encrypted value just because alarmInstructions wasn't resent.
    if (security) {
      const { alarmInstructions, ...securityRest } = security;
      for (const [key, value] of Object.entries(securityRest)) {
        update[`security.${key}`] = value;
      }
      if (alarmInstructions) {
        update['security.alarmInstructionsEncrypted'] = this.encryptionService.encrypt(alarmInstructions);
      }
    }

    // A signed agreement means the public intake form is submitting the completed
    // record (whether it started as a staff-created lead or a fresh submission).
    if (dto.agreement?.signedName) {
      update.agreement = { ...dto.agreement, signedAt: new Date(), date: new Date() };
      update.status = CustomerStatus.ACTIVE;
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
