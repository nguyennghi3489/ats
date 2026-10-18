import { ConfigError } from './config/config.js';
import { createWorker } from './worker/worker.js';
import { loadWorkerConfig } from './worker/worker-config.js';

function readConfig() {
  try {
    return loadWorkerConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      // Fail fast before Nest starts, so the message is the last thing in the container log.
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

await createWorker(readConfig());
