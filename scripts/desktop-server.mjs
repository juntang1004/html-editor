import { createStudioServer, loadConfiguration } from './server.mjs';
const configuration = loadConfiguration({ directory: process.env.STUDIO_CONFIG_DIR });
configuration.instance = `desktop-${process.pid}`;
const server = createStudioServer(configuration);
server.listen(0, '127.0.0.1', () => console.log(`STUDIO_PORT=${server.address().port}`));
// Closing the Rust parent's pipe also closes the backend after a crash.
process.stdin.resume();
const shutdown = () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 1000).unref();
};
process.stdin.on('end', shutdown);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, shutdown);
