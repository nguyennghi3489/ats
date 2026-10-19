// Deliberate type error: the shared Health type only allows status 'ok' or 'error'.
import type { Health } from '../../../src/index.js';

export const bad: Health = { status: 'down', db: 'ok' };
