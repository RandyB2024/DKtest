import { createServer as createOfficeServer } from '../../src/server.mjs';
import { loadConfig } from '../../src/config.mjs';

// Historical domain tests explicitly opt into the isolated local demo.
export function createServer() {
  return createOfficeServer({ config: loadConfig({ ALLOW_DEVELOPMENT_AUTH: 'true' }) });
}
