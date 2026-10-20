import { RequestMethod, type Type } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PUBLIC_ROUTE, SESSION_ONLY_ROUTE } from '../../src/access/decorators.js';
import { startTestApp, TEST_WEB_ORIGIN, type TestApp } from '../support/test-app.js';

/** The only routes that may skip the global access guard. Adding one is a security decision. */
const PUBLIC_ROUTES = ['GET /health'];

/** Routes that need a session but no workspace. */
const SESSION_ONLY_ROUTES = ['GET /api/me', 'POST /api/workspaces'];

interface Route {
  /** `GET /api/me` */
  name: string;
  method: string;
  path: string;
  controller: Type;
  handler: (...args: unknown[]) => unknown;
}

/** Every route Nest registered, read from the controllers' metadata. */
function registeredRoutes(api: TestApp): Route[] {
  const routes: Route[] = [];
  for (const module of api.app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as Type | null;
      if (!controller) continue;
      const prefix = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
      const prototype = controller.prototype as Record<string, unknown>;
      for (const key of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[key];
        if (key === 'constructor' || typeof handler !== 'function') continue;
        const path: unknown = Reflect.getMetadata(PATH_METADATA, handler);
        if (path === undefined) continue;
        const method =
          RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
        const full = `/${[prefix, String(path)].join('/')}`
          .replace(/\/+/g, '/')
          .replace(/(.)\/$/, '$1');
        routes.push({
          name: `${method} ${full}`,
          method,
          path: full,
          controller,
          handler: handler as Route['handler'],
        });
      }
    }
  }
  return routes;
}

describe('every registered route goes through the global access guard', () => {
  let api: TestApp;
  let routes: Route[];
  const reflector = new Reflector();

  beforeAll(async () => {
    api = await startTestApp();
    routes = registeredRoutes(api);
  });

  afterAll(async () => {
    await api.close();
  });

  function flagged(route: Route, key: string): boolean {
    return reflector.getAllAndOverride<boolean>(key, [route.handler, route.controller]) === true;
  }

  it('finds the routes', () => {
    expect(routes.map((route) => route.name)).toEqual(
      expect.arrayContaining([...PUBLIC_ROUTES, ...SESSION_ONLY_ROUTES]),
    );
  });

  it('marks only the expected routes @Public() and @SessionOnly()', () => {
    expect(
      routes
        .filter((route) => flagged(route, PUBLIC_ROUTE))
        .map((r) => r.name)
        .sort(),
    ).toEqual([...PUBLIC_ROUTES].sort());
    expect(
      routes
        .filter((route) => flagged(route, SESSION_ONLY_ROUTE))
        .map((r) => r.name)
        .sort(),
    ).toEqual([...SESSION_ONLY_ROUTES].sort());
  });

  it('registers no guard per controller or route (the access guard is global)', () => {
    for (const route of routes) {
      expect(Reflect.getMetadata(GUARDS_METADATA, route.controller), route.name).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, route.handler), route.name).toBeUndefined();
    }
  });

  it('answers 401 UNAUTHENTICATED without a session on every non-public route', async () => {
    const guarded = routes.filter((route) => !PUBLIC_ROUTES.includes(route.name));
    expect(guarded.length).toBeGreaterThan(0);
    for (const route of guarded) {
      const path = route.path.replace(/[:*][A-Za-z0-9_]+/g, 'x');
      const response = await api.request(path, {
        method: route.method === 'ALL' ? 'GET' : route.method,
        headers: { 'content-type': 'application/json', origin: TEST_WEB_ORIGIN },
        body: ['GET', 'HEAD', 'ALL'].includes(route.method) ? undefined : '{}',
      });
      expect(response.status, route.name).toBe(401);
      expect(await response.json(), route.name).toMatchObject({ code: 'UNAUTHENTICATED' });
    }
  });
});
