import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import {
  AuditLogEntry,
  AuditLogEntrySchema,
} from './schemas/audit-log-entry.schema';

// Deliberately a leaf module (no dependencies on other feature modules) so
// CustomersModule/InvoicesModule/QuotesModule/PaymentsModule can each import
// it and inject AuditLogService one-directionally, same pattern already used
// for PaymentsModule -> InvoicesModule.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLogEntry.name, schema: AuditLogEntrySchema },
    ]),
  ],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
