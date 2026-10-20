import { describe, expect, expectTypeOf, it } from 'vitest';
import { AuditService } from './audit.service.js';

// The audit log is append-only: the writer can add entries and nothing else (decisions §13).
describe('AuditService', () => {
  it('has no method other than record', () => {
    const methods = Object.getOwnPropertyNames(AuditService.prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(methods).toEqual(['record']);
  });

  it('exposes only record at the type level', () => {
    expectTypeOf<keyof AuditService>().toEqualTypeOf<'record'>();
  });
});
