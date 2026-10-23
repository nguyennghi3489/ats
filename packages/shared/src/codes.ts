// Job and application codes (decisions §5): `{PREFIX}-{NNN}`, numbered by a per-workspace counter,
// at least three digits, never reused or edited.

/** What a workspace counter numbers: jobs and applications each have their own sequence. */
export const CODE_KINDS = ['job', 'application'] as const;
export type CodeKind = (typeof CODE_KINDS)[number];

/** Prefix of every application code (`ỨT-001`); job codes use the workspace's `codePrefix`. */
export const APPLICATION_CODE_PREFIX = 'ỨT';

/** Numbers are zero-padded to at least this many digits; larger ones keep all their digits. */
export const CODE_MIN_DIGITS = 3;

/**
 * `formatCode('AN', 7)` → `AN-007`, `formatCode('AN', 1234)` → `AN-1234`. `n` is a counter value,
 * so anything but a positive integer is a programming error and throws `RangeError`.
 */
export function formatCode(prefix: string, n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`code number must be a positive integer, got ${n}`);
  }
  return `${prefix}-${String(n).padStart(CODE_MIN_DIGITS, '0')}`;
}
