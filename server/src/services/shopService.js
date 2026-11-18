import { createHash } from 'node:crypto';
import { createRequestIdempotencyRepository } from '../repositories/requestIdempotencyRepository.js';
import { createShopRepository } from '../repositories/shopRepository.js';
import { httpError } from '../utils/httpError.js';

export function createShopService({ db, gameEngine, streakService }) {
  const repository = createShopRepository(db);
  const idempotency = createRequestIdempotencyRepository(db);
  const config = gameEngine.rewardConfig();
  const units = gameEngine.rewardUnits();
  const clock = gameEngine.clock;

  function currentTime() { return clock.now(); }

  function list(userId) {
    const now = currentTime();
    const state = gameEngine.purchaseState(userId);
    const owned = repository.ownedItems(userId);
    const cutoff = new Date(now.getTime() - config.shop.freezePurchaseWindowDays * units.hoursPerDay * units.minutesPerHour * units.secondsPerMinute * units.millisecondsPerSecond).toISOString();
    const freezePurchases = repository.freezePurchaseCount(userId, cutoff);
    const inventory = streakService.freezeHistory(userId).inventory;
    const quotaRemaining = Math.max(0, config.shop.freezePurchasesPerRolling30Days - freezePurchases);
    const inventoryCap = gameEngine.publicRules().streaks.tracking.freeze.maxHeld;
    return { level: state.level, spendableXp: state.spendableXp, freezes: { inventory, inventoryCap, quotaRemaining },
      items: config.shop.items.map((item) => ({ ...item, owned: item.type !== 'FREEZE' && owned.has(item.slug), available: state.level >= item.minLevel &&
        (item.type === 'FREEZE' ? inventory < inventoryCap && quotaRemaining > 0 : !owned.has(item.slug)) })) };
  }

  function purchase(userId, itemSlug, idempotencyKey) {
    if (!gameEngine.enabled) throw httpError(503, 'GAMIFICATION_DISABLED', 'The XP shop is currently unavailable.');
    const item = config.shop.items.find(({ slug }) => slug === itemSlug);
    if (!item) throw httpError(404, 'ITEM_NOT_FOUND', 'Shop item not found.');
    const body = { itemSlug };
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const prior = idempotency.find(userId, idempotencyKey);
    if (prior) {
      if (prior.requestHash !== requestHash) throw httpError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request.');
      return { status: 200, purchase: prior.response };
    }

    const result = repository.transaction(() => {
      const now = currentTime();
      const nowIso = now.toISOString();
      const state = gameEngine.purchaseState(userId);
      if (state.level < item.minLevel) throw httpError(403, 'LEVEL_TOO_LOW', `Reach level ${item.minLevel} to unlock this item.`);
      if (item.type !== 'FREEZE' && repository.owned(userId, item.slug)) throw httpError(409, 'ALREADY_OWNED', 'You already own this cosmetic.');
      const rollingMilliseconds = config.shop.freezePurchaseWindowDays * units.hoursPerDay * units.minutesPerHour * units.secondsPerMinute * units.millisecondsPerSecond;
      if (item.type === 'FREEZE' && repository.freezePurchaseCount(userId, new Date(now.getTime() - rollingMilliseconds).toISOString()) >= config.shop.freezePurchasesPerRolling30Days) {
        throw httpError(409, 'FREEZE_PURCHASE_LIMIT', 'You have reached the rolling 30-day freeze purchase limit.');
      }
      const purchaseId = repository.nextPurchaseId();
      const spend = gameEngine.recordSpend({ userId, purchaseId, costXp: item.costXp, itemType: item.type, now: nowIso });
      repository.insertPurchase({ id: purchaseId, userId, itemSlug: item.slug, itemType: item.type, costXp: item.costXp,
        ledgerEntryId: spend.entryId, idempotencyKey, createdAt: nowIso, meta: {} });
      let effect = null;
      if (item.type === 'FREEZE') {
        effect = streakService.grantFreeze(userId, { source: 'PURCHASE', idempotencyKey: String(purchaseId), outerTransaction: true });
        if (!effect.granted) throw httpError(409, 'FREEZE_INVENTORY_FULL', 'Your freeze inventory is full; no XP was spent.');
      } else {
        repository.addCosmetic({ userId, slug: item.slug, purchaseId, acquiredAt: nowIso });
      }
      const purchase = { id: purchaseId, itemSlug: item.slug, itemType: item.type, costXp: item.costXp,
        spendableXp: spend.spendableXp, lifetimeXp: spend.lifetimeXp, level: spend.level, effect };
      gameEngine.emitRewardEvent('PURCHASE_COMPLETED', userId, purchase, `PURCHASE:${purchaseId}`);
      repository.insertNotice({ userId, data: purchase, createdAt: nowIso, dedupeKey: `PURCHASE:${purchaseId}:NOTICE` });
      repository.insertActivity({ userId, id: purchaseId, createdAt: nowIso, data: purchase });
      idempotency.insert({ userId, key: idempotencyKey, requestHash, responseStatus: 201, response: purchase, createdAt: nowIso });
      return { status: 201, purchase };
    });
    return result;
  }

  return { list, purchase, history: (userId) => repository.purchases(userId) };
}
