import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

// Just a named label (e.g. "Insurance", "Supplies") -- staff pick from these
// when recording an expense. Copied onto Expense.category by name at creation
// time, not kept as a live reference, same reasoning as Payment.paymentMethod:
// a recorded expense shouldn't retroactively change if this library entry is
// later renamed or deleted.
@Schema({ timestamps: true })
export class ExpenseCategory extends Document {
  @Prop({ required: true })
  name: string;
}

export const ExpenseCategorySchema = SchemaFactory.createForClass(ExpenseCategory);
