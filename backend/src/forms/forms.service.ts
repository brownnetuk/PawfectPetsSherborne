import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateFormDto } from './dto/create-form.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { DEFAULT_CUSTOMER_INTAKE_FORM } from './default-customer-intake-form';
import { Form } from './schemas/form.schema';

@Injectable()
export class FormsService implements OnModuleInit {
  constructor(
    @InjectModel(Form.name) private readonly formModel: Model<Form>,
  ) {}

  // Seeds the "Customer Intake" form once, on boot -- a first-of-its-kind
  // seed-on-init pattern in this codebase (no existing module does this), so
  // it's a single atomic upsert ($setOnInsert) rather than a find-then-insert
  // pair, which would otherwise race across multiple app instances. Staff can
  // freely edit or delete this seeded form afterward like any other -- it's
  // never re-created once it exists (findOneAndUpdate with upsert only ever
  // inserts when the {name: 'Customer Intake'} filter matches nothing).
  async onModuleInit(): Promise<void> {
    await this.formModel
      .findOneAndUpdate(
        { name: DEFAULT_CUSTOMER_INTAKE_FORM.name },
        { $setOnInsert: DEFAULT_CUSTOMER_INTAKE_FORM },
        { upsert: true },
      )
      .exec();
  }

  create(dto: CreateFormDto): Promise<Form> {
    return new this.formModel(dto).save();
  }

  findAll(): Promise<Form[]> {
    return this.formModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<Form> {
    const form = await this.formModel.findById(id).exec();
    if (!form) {
      throw new NotFoundException(`Form ${id} not found`);
    }
    return form;
  }

  async update(id: string, dto: UpdateFormDto): Promise<Form> {
    const form = await this.formModel
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();
    if (!form) {
      throw new NotFoundException(`Form ${id} not found`);
    }
    return form;
  }

  async remove(id: string): Promise<void> {
    const result = await this.formModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Form ${id} not found`);
    }
  }
}
