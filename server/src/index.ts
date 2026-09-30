import { serve } from '@hono/node-server';
import { createServer } from './app';
import { loadEnv } from './env';

const env = loadEnv();
const { app, close } = await createServer(env);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Galla API on http://localhost:${info.port} (${env.NODE_ENV})`);
});

const shutdown = () => {
  server.close();
  void close().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
