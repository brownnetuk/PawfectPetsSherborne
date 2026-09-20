import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { Product } from '../../products/schemas/product.schema';

// Singleton-style collection, same pattern as BusinessInfo/EmailSettings:
// exactly one document holds which catalog Product each visit
// count/day-type combination maps to (Settings > Bookings > Visits) --
// unset means that combination has no product configured yet.
@Schema({ timestamps: true })
export class VisitMapping extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  oneVisitWeekdayProduct?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  oneVisitWeekendProduct?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  oneVisitBankHolidayProduct?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  twoVisitWeekdayProduct?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  twoVisitWeekendProduct?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  twoVisitBankHolidayProduct?: Types.ObjectId;

  // Settings > Bookings > Day Care / Boarding cards -- same singleton,
  // separate service types from Visits' per-day-type mapping above.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  dayCareHalfDayProduct?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  dayCareFullDayProduct?: Types.ObjectId;

  // 2nd-dog rates for the same options (used when a customer books more than
  // one dog for the same day-care/boarding stay).
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  dayCareSecondDogHalfDayProduct?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  dayCareSecondDogFullDayProduct?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  boardingPerDayProduct?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  boardingSecondDogPerDayProduct?: Types.ObjectId;

  // Leftover time after whole 24h boarding blocks that rounds up to a 12h
  // charge rather than a full extra day (see DayBookingsService.
  // computeBoardingPlan) -- a dedicated Boarding product, not the Day Care
  // Half Day one, so a boarding stay's leftover is never billed as day care.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  boardingHalfDayProduct?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: Product.name })
  boardingSecondDogHalfDayProduct?: Types.ObjectId;
}

export const VisitMappingSchema = SchemaFactory.createForClass(VisitMapping);
