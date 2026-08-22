import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ExpenseCategory, ExpenseCategorySchema } from './schemas/expense-category.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: ExpenseCategory.name, schema: ExpenseCategorySchema }])],
  controllers: [ExpenseCategoriesController],
  providers: [ExpenseCategoriesService],
})
export class ExpenseCategoriesModule {}
