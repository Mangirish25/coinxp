import { checkDatabase } from '../repositories/healthRepository.js';

export function getHealth(db, clock = () => new Date(), gameEngine) {
  if (!checkDatabase(db)) throw new Error('Database health query returned an unexpected result.');
  return { status: 'ok', db: 'connected', time: clock().toISOString(), gamificationDeadEvents: gameEngine?.dependencies.outbox.deadCount() ?? 0 };
}
