import { startBridgeServer } from './server.js';
import { DEFAULT_BRIDGE_PORT } from './types.js';

const port = parseInt(process.env['DESH_BRIDGE_PORT'] ?? '', 10) || DEFAULT_BRIDGE_PORT;

startBridgeServer({ port }).then((server) => {
  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
});
