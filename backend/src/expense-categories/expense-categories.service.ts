import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { ExpenseCategory } from './schemas/expense-category.schema';

@Injectable()
export class ExpenseCategoriesService {
  constructor(
    @InjectModel(ExpenseCategory.name) private readonly expenseCategoryModel: Model<ExpenseCategory>,
  ) {}

  create(dto: CreateExpenseCategoryDto): Promise<ExpenseCategory> {
    return new this.expenseCategoryModel(dto).save();
  }

  findAll(): Promise<ExpenseCategory[]> {
    return this.expenseCategoryModel.find().sort({ name: 1 }).exec();
  }

  async update(id: string, dto: CreateExpenseCategoryDto): Promise<ExpenseCategory> {
    const category = await this.expenseCategoryModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!category) {
      throw new NotFoundException(`Expense category ${id} not found`);
    }
    return category;
  }

  async remove(id: string): Promise<void> {
    const result = await this.expenseCategoryModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Expense category ${id} not found`);
    }
  }
}
