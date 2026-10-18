import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApp } from '../app.js';
import { JsonLogger } from '../logging/json-logger.js';
import { currentRequestId } from './request-context.js';
import { REQUEST_ID_HEADER } from './request-id.middleware.js';

@Controller('whoami')
class WhoAmIController {
  @Get()
  whoami(): { requestId: string | undefined } {
    return { requestId: currentRequestId() };
  }
}

describe('request id', () => {
  let app: INestApplication;
  let baseUrl: string;
  const logger = new JsonLogger({ logLevels: [] });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [WhoAmIController] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, logger);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates an id, returns it in a header and exposes it to handlers', async () => {
    const response = await fetch(`${baseUrl}/whoami`);
    const id = response.headers.get(REQUEST_ID_HEADER);

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await response.json()).toEqual({ requestId: id });
  });

  it('keeps a well-formed id sent by the caller', async () => {
    const response = await fetch(`${baseUrl}/whoami`, {
      headers: { [REQUEST_ID_HEADER]: 'edge-abc.123_X' },
    });

    expect(response.headers.get(REQUEST_ID_HEADER)).toBe('edge-abc.123_X');
    expect(await response.json()).toEqual({ requestId: 'edge-abc.123_X' });
  });

  it('replaces a malformed id sent by the caller', async () => {
    const response = await fetch(`${baseUrl}/whoami`, {
      headers: { [REQUEST_ID_HEADER]: 'bad id\twith "quotes"' },
    });

    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('logs each completed request with its id', async () => {
    const log = vi.spyOn(logger, 'log').mockImplementation(() => undefined);
    try {
      const response = await fetch(`${baseUrl}/whoami?x=1`);
      await response.text();
      await vi.waitFor(() => expect(log).toHaveBeenCalled());

      expect(log).toHaveBeenCalledWith(
        'request completed',
        expect.objectContaining({
          requestId: response.headers.get(REQUEST_ID_HEADER),
          method: 'GET',
          path: '/whoami',
          statusCode: 200,
          durationMs: expect.any(Number),
        }),
        'HTTP',
      );
    } finally {
      log.mockRestore();
    }
  });
});
