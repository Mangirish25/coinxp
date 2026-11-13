import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/db/connection.js';
import { migrateDatabase } from '../src/db/migrator.js';
import { createGamificationEngine } from '../src/gamification/engine.js';

const [command, ...args] = process.argv.slice(2);
const apply = args.includes('--apply');
const values = args.filter((value) => value !== '--apply');
const env = loadEnv();
const db = createDatabase(env.dbPath);

try {
  migrateDatabase(db);
  const engine = createGamificationEngine({ db, enabled: env.gamificationEnabled });
  if (command === 'adjust') {
    const [userId, delta, ...reasonParts] = values;
    const data = { userId: Number(userId), delta: Number(delta), reason: reasonParts.join(' '), actor: 'cli' };
    console.log(JSON.stringify(apply ? engine.adjust(data) : { dryRun: true, command, ...data }, null, 2));
  } else if (command === 'reconcile') {
    const [userId, from, to] = values;
    console.log(JSON.stringify(apply ? engine.reconcileRange(Number(userId), from, to) : { dryRun: true, command, userId: Number(userId), from, to }, null, 2));
  } else if (command === 'rebuild-cache') {
    const [userId] = values;
    console.log(JSON.stringify(apply ? engine.rebuildCache(Number(userId)) : { dryRun: true, command, userId: Number(userId) }, null, 2));
  } else if (command === 'requeue-dead') {
    const [userId] = values;
    console.log(JSON.stringify(apply ? { requeued: engine.requeueDead(userId ? Number(userId) : null) } : { dryRun: true, command, userId: userId ? Number(userId) : null }, null, 2));
  } else {
    throw new Error('Usage: gamificationCli.js <adjust|reconcile|rebuild-cache|requeue-dead> ... [--apply]');
  }
} finally {
  db.close();
}
