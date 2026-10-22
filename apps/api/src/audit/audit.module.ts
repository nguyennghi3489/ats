import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/**
 * The audit log writer, injectable everywhere: features call `AuditService.record(tx, entry)` inside
 * the transaction of the sensitive change.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
