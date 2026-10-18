/** Helpers for comparing locale files, used by the key-parity test. */

type Messages = Record<string, unknown>;

function isNamespace(value: unknown): value is Messages {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lists every leaf as `[dotted.key, value]`, in file order. */
export function flattenMessages(messages: Messages, prefix = ''): Array<[string, unknown]> {
  return Object.entries(messages).flatMap(([key, value]): Array<[string, unknown]> => {
    const path = prefix ? `${prefix}.${key}` : key;
    return isNamespace(value) ? flattenMessages(value, path) : [[path, value]];
  });
}

export function diffKeys(a: Messages, b: Messages): { missingInB: string[]; missingInA: string[] } {
  const keysA = new Set(flattenMessages(a).map(([key]) => key));
  const keysB = new Set(flattenMessages(b).map(([key]) => key));
  return {
    missingInB: [...keysA].filter((key) => !keysB.has(key)),
    missingInA: [...keysB].filter((key) => !keysA.has(key)),
  };
}
