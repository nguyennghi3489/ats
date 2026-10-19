import { Inject, Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from './config.js';
import { APP_CONFIG, ConfigModule } from './config.module.js';

const config: AppConfig = {
  nodeEnv: 'test',
  port: 4321,
  logLevel: 'error',
  databaseUrl: 'postgres://ats:ats@127.0.0.1:5432/ats_test',
  redisUrl: 'redis://127.0.0.1:6379',
  betterAuthSecret: 'test-only-better-auth-secret-0123456789abcdef',
  betterAuthUrl: 'http://localhost:3000',
  webOrigin: 'http://localhost:5173',
};

@Injectable()
class PortReader {
  constructor(@Inject(APP_CONFIG) private readonly appConfig: AppConfig) {}

  port(): number {
    return this.appConfig.port;
  }
}

// Injected by class type only: fails if the test transform drops decorator metadata.
@Injectable()
class PortConsumer {
  constructor(readonly reader: PortReader) {}
}

@Module({ providers: [PortReader, PortConsumer] })
class FeatureModule {}

describe('ConfigModule', () => {
  it('makes the config injectable in any module without importing ConfigModule there', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(config), FeatureModule],
    }).compile();

    expect(moduleRef.get(PortConsumer).reader.port()).toBe(4321);
  });
});
