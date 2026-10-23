import { Global, Module } from '@nestjs/common';
import { CodesService } from './codes.service.js';

/**
 * Job and application codes (decisions §5), injectable everywhere: features call
 * `CodesService.nextCode(tx, workspaceId, kind)` inside the transaction that inserts the record.
 * The table is in `codes.schema.ts`.
 */
@Global()
@Module({
  providers: [CodesService],
  exports: [CodesService],
})
export class CodesModule {}
