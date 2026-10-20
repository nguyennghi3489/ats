import { type Health, healthSchema } from '@ats/shared';
import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../access/decorators.js';
import type { Database } from '../database/database.js';
import { DATABASE } from '../database/database.module.js';

/**
 * Health check for Compose, Caddy and uptime monitors. Public: it reveals nothing.
 * 200 `{ status: "ok", db: "ok" }`, or 503 `{ status: "error", db: "down" }` when Postgres is unreachable.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<Health> {
    if (await this.database.isReachable()) {
      return healthSchema.parse({ status: 'ok', db: 'ok' });
    }
    response.status(HttpStatus.SERVICE_UNAVAILABLE);
    return healthSchema.parse({ status: 'error', db: 'down' });
  }
}
