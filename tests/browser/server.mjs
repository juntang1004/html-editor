import { createStudioServer } from '../../server.mjs';

// Importing the server factory never loads .env. No provider call can escape this server.
const server = createStudioServer({
  apiKey: 'test-only-not-a-secret',
  token: 'browser-regression-token',
  instance: 'isolated-browser-regression',
  apiClient: async () => { throw new Error('External API disabled in browser tests'); },
});
server.listen(Number(process.env.STUDIO_TEST_PORT || 4417), '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
