import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Animal } from '../animals/schemas/animal.schema';
import { Booking } from '../bookings/schemas/booking.schema';
import { describeBlockers } from '../common/delete-guard.util';
import { EncryptionService } from '../common/encryption/encryption.service';
import { CrmActivity } from '../crm/schemas/crm-activity.schema';
import { Invoice } from '../invoices/schemas/invoice.schema';
import { Quote } from '../quotes/schemas/quote.schema';
import { formatAddress, formatFullName } from './customer-format.util';
import { CreateCustomerDto, EmergencyContactDto, EmergencyVetDto } from './dto/create-customer.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Customer, CustomerStatus } from './schemas/customer.schema';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(Animal.name) private readonly animalModel: Model<Animal>,
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<Invoice>,
    @InjectModel(Quote.name) private readonly quoteModel: Model<Quote>,
    @InjectModel(CrmActivity.name) private readonly crmActivityModel: Model<CrmActivity>,
    private readonly encryptionService: EncryptionService,
  ) {}

  private validateEmergencyContact(emergencyContact: EmergencyContactDto) {
    if (
      !emergencyContact.sameAsClient &&
      (!emergencyContact.firstName || !emergencyContact.address1 || !emergencyContact.town ||
        !emergencyContact.postcode || !emergencyContact.phoneNumber)
    ) {
      throw new BadRequestException(
        'Emergency contact name, address, and phone number are required unless "same as client" is set',
      );
    }
  }

  private validateEmergencyVet(emergencyVet: EmergencyVetDto) {
    if (!emergencyVet.authorisation?.signedName) {
      throw new BadRequestException('Alternative vet care authorisation must be signed');
    }
  }

  // Recomputes the stored `name`/`address`/derived-boolean fields from their
  // structured source fields. Only touches a target when at least one of its
  // source fields is present in the payload, so a partial update that doesn't
  // mention e.g. firstName/surname at all leaves the existing computed `name`
  // untouched rather than recomputing it from a half-empty payload.
  private applyComputedFields(update: Record<string, any>) {
    if (update.firstName !== undefined || update.surname !== undefined) {
      update.name = formatFullName(update.firstName, update.surname);
    }
    if (
      update.address1 !== undefined || update.address2 !== undefined ||
      update.town !== undefined || update.county !== undefined || update.postcode !== undefined
    ) {
      update.address = formatAddress(update);
    }
    if (update.emergencyContact) {
      const ec = update.emergencyContact;
      if (!ec.sameAsClient) {
        ec.name = formatFullName(ec.firstName, ec.surname);
        ec.address = formatAddress(ec);
      }
    }
    if (update.emergencyVet) {
      const ev = update.emergencyVet;
      ev.address = formatAddress(ev);
      ev.alternativeVetAuthorised = !!ev.authorisation?.signedName;
      if (ev.authorisation?.signedName) {
        ev.authorisation = { ...ev.authorisation, signedAt: new Date() };
      }
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

    const payload: Record<string, any> = { ...dto };
    this.applyComputedFields(payload);

    const created = new this.customerModel({
      ...payload,
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
    // This also serves the public intake form (GET /customers/:id, @Public()),
    // which has no legitimate use for the encrypted ciphertext -- decryption only
    // ever happens via the dedicated staff-only getAlarmInstructions() below.
    const customer = await this.customerModel
      .findById(id)
      .select('-security.alarmInstructionsEncrypted')
      .exec();
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
    const update: Record<string, any> = { ...rest };
    this.applyComputedFields(update);

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

  async updateStatus(id: string, status: CustomerStatus): Promise<Customer> {
    const customer = await this.customerModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .exec();
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  async remove(id: string): Promise<void> {
    const [petCount, bookingCount, invoiceCount, quoteCount, activityCount] = await Promise.all([
      this.animalModel.countDocuments({ customer: id }).exec(),
      this.bookingModel.countDocuments({ customer: id }).exec(),
      this.invoiceModel.countDocuments({ customer: id }).exec(),
      this.quoteModel.countDocuments({ customer: id }).exec(),
      this.crmActivityModel.countDocuments({ customer: id }).exec(),
    ]);
    const blockers = describeBlockers({
      pet: petCount,
      booking: bookingCount,
      invoice: invoiceCount,
      quote: quoteCount,
      'activity record': activityCount,
    });
    if (blockers) {
      throw new ConflictException(
        `Can't delete this customer: they have ${blockers} on file. Remove those first.`,
      );
    }
    const result = await this.customerModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
  }

  /** Decrypts alarm instructions for authorised operational use (e.g. dispatching staff to the property). */
  async getAlarmInstructions(id: string): Promise<string | null> {
    // Queries the model directly rather than via findOne(), which deliberately
    // excludes this ciphertext from its (also publicly-reachable) result.
    const customer = await this.customerModel.findById(id).exec();
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    const ciphertext = customer.security?.alarmInstructionsEncrypted;
    return ciphertext ? this.encryptionService.decrypt(ciphertext) : null;
  }
}
