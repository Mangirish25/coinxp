import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/db/connection.js';
import { migrateDatabase } from '../src/db/migrator.js';
import { createGamificationEngine } from '../src/gamification/engine.js';

const [command, ...args] = process.argv.slice(2);
const apply = args.includes('--apply');
const optionNames = new Set(['case','note','actor','reason-code']);
const options = {};
const values = [];
for (let index = 0; index < args.length; index += 1) {
  const value=args[index];
  if(value==='--apply')continue;
  if(value.startsWith('--')){const name=value.slice(2);if(optionNames.has(name))options[name]=args[++index]??null;continue;}
  values.push(value);
}
const env = loadEnv();
const db = createDatabase(env.dbPath);

try {
  migrateDatabase(db);
  const engine = createGamificationEngine({ db, enabled: env.gamificationEnabled });
  if (command === 'adjust') {
    const [userId, delta, ...reasonParts] = values;
    const reason=options.note??reasonParts.join(' ');
    const data = { userId: Number(userId), delta: Number(delta), reason, actor: options.actor, caseId: options.case?Number(options.case):null,
      reasonCode: options['reason-code']??'ADMIN_ADJUSTMENT' };
    if(apply&&(!data.actor||reason.trim().length<10))throw new Error('Applied adjustments require --actor and a note of at least 10 characters.');
    if(apply&&(data.delta<0||data.reasonCode.startsWith('INTEGRITY_'))&&(!data.caseId||!data.actor||reason.trim().length<10))
      throw new Error('Negative or integrity adjustments require --case, --actor, and a note of at least 10 characters.');
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
