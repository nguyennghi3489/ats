import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config/config.js';

function readConfig() {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      // Fail fast before Nest starts, so the message is the last thing in the container log.
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

const config = readConfig();
const app = await createApp(config);
await app.listen(config.port);
