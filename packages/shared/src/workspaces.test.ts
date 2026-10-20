import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_KEY_HEADER,
  WORKSPACE_NAME_MAX_LENGTH,
  WORKSPACE_PREFIX_FALLBACK,
  WORKSPACE_ROLES,
  createWorkspaceRequestSchema,
  workspaceNameSchema,
  workspacePrefix,
  workspaceSchema,
} from './index.js';

describe('workspacePrefix', () => {
  it.each([
    ['An Nhiên', 'AN'],
    ['Mây Studio', 'MS'],
    ['Hải Đăng Labs', 'HDL'],
    ['Acme', 'AC'],
    ['Đông Á', 'DA'],
    ['123', 'WS'],
  ])('%s → %s', (name, prefix) => {
    expect(workspacePrefix(name)).toBe(prefix);
  });

  it('keeps at most 4 initials', () => {
    expect(workspacePrefix('Công ty Cổ phần Ánh Dương Việt')).toBe('CTCP');
  });

  it('ignores digits, punctuation and extra spaces between words', () => {
    expect(workspacePrefix('  3D   studio - ơn  ')).toBe('DSO');
  });

  it('uses the only letter of a one-letter name', () => {
    expect(workspacePrefix('Ý')).toBe('Y');
  });

  it('falls back when the name has no Latin letters', () => {
    expect(workspacePrefix('東京 2026')).toBe(WORKSPACE_PREFIX_FALLBACK);
    expect(workspacePrefix('')).toBe('WS');
  });
});

describe('workspaceNameSchema', () => {
  it('trims the name', () => {
    expect(workspaceNameSchema.parse('  An Nhiên  ')).toBe('An Nhiên');
  });

  it('refuses an empty or blank name', () => {
    expect(workspaceNameSchema.safeParse('').success).toBe(false);
    expect(workspaceNameSchema.safeParse('   ').success).toBe(false);
  });

  it('accepts 80 characters and refuses 81', () => {
    expect(WORKSPACE_NAME_MAX_LENGTH).toBe(80);
    expect(workspaceNameSchema.safeParse('a'.repeat(80)).success).toBe(true);
    expect(workspaceNameSchema.safeParse('a'.repeat(81)).success).toBe(false);
  });
});

describe('createWorkspaceRequestSchema', () => {
  it('needs a name', () => {
    expect(createWorkspaceRequestSchema.parse({ name: ' Mây ' })).toEqual({ name: 'Mây' });
    expect(createWorkspaceRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('workspaceSchema', () => {
  it('accepts a created workspace', () => {
    const workspace = { id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role: 'admin' };
    expect(workspaceSchema.parse(workspace)).toEqual(workspace);
  });

  it('knows the three roles only', () => {
    expect(WORKSPACE_ROLES).toEqual(['admin', 'recruiter', 'collaborator']);
    const workspace = { id: 'org_1', name: 'An Nhiên', codePrefix: 'AN', role: 'owner' };
    expect(workspaceSchema.safeParse(workspace).success).toBe(false);
  });

  it('names the idempotency header', () => {
    expect(IDEMPOTENCY_KEY_HEADER).toBe('Idempotency-Key');
  });
});
