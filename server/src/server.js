import { loadEnv } from './config/env.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';
import { createApp } from './app.js';
import { startGamificationScheduler } from './gamification/scheduler.js';

const env = loadEnv();
const db = createDatabase(env.dbPath);
migrateDatabase(db);
const app = createApp({ db, config: env });
const scheduler = startGamificationScheduler(app.locals.gameEngine, { db, streakAdvancer: app.locals.streakService });
const server = app.listen(env.port, () => console.log(`CoinXP API listening on port ${env.port}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () =>
    server.close(() => {
      scheduler.stop();
      db.close();
      process.exit(0);
    }),
  );
}
