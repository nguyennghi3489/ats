import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../app.js';
import { JsonLogger } from '../logging/json-logger.js';

@Controller('boom')
class BoomController {
  @Get('crash')
  crash(): never {
    throw new Error('database password is hunter2');
  }

  @Get('coded')
  coded(): never {
    throw new ForbiddenException({ code: 'WORKSPACE_ACCESS_REVOKED' });
  }

  @Get('plain')
  plain(): never {
    throw new BadRequestException('bad input');
  }

  @Get('thrown-string')
  thrownString(): never {
    throw 'not an error';
  }
}

describe('AllExceptionsFilter', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [BoomController] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, new JsonLogger({ logLevels: [] }));
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  async function get(
    path: string,
  ): Promise<{ status: number; body: Record<string, unknown>; raw: string }> {
    const response = await fetch(`${baseUrl}${path}`);
    const raw = await response.text();
    return { status: response.status, body: JSON.parse(raw) as Record<string, unknown>, raw };
  }

  it('answers an unknown route with a NOT_FOUND code and no stack trace', async () => {
    const { status, body, raw } = await get('/no-such-route');

    expect(status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
    expect(typeof body.message).toBe('string');
    expect(Object.keys(body).sort()).toEqual(['code', 'message']);
    expect(raw).not.toMatch(/\bat .+:\d+:\d+/);
  });

  it('hides the details of an unexpected error', async () => {
    const { status, body, raw } = await get('/boom/crash');

    expect(status).toBe(500);
    expect(body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toMatch(/\bat .+:\d+:\d+/);
  });

  it('treats a thrown non-error as an internal error', async () => {
    const { status, body } = await get('/boom/thrown-string');

    expect(status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('keeps the code an HTTP exception carries', async () => {
    const { status, body } = await get('/boom/coded');

    expect(status).toBe(403);
    expect(body.code).toBe('WORKSPACE_ACCESS_REVOKED');
    expect(typeof body.message).toBe('string');
  });

  it('derives the code from the status when an HTTP exception has none', async () => {
    const { status, body } = await get('/boom/plain');

    expect(status).toBe(400);
    expect(body).toEqual({ code: 'BAD_REQUEST', message: 'bad input' });
  });
});
