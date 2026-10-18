import { type Health, healthSchema } from '@ats/shared';
import { Controller, Get } from '@nestjs/common';

/** Liveness check for Compose, Caddy and uptime monitors. Public: it reveals nothing. */
@Controller('health')
export class HealthController {
  @Get()
  check(): Health {
    return healthSchema.parse({ status: 'ok' });
  }
}
