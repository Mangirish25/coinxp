import { createShopRepository } from '../repositories/shopRepository.js';
import { createChallengeRepository } from '../repositories/challengeRepository.js';

export function createShopAdminService({db,gameEngine}) {
  const shop=createShopRepository(db);const challenges=createChallengeRepository(db);
  function refund(purchaseId,{actor,note},{apply=false}={}) {
    const purchase=shop.adminPurchase(purchaseId);
    if(!purchase)throw new Error('Purchase not found.');
    if(purchase.status==='REFUNDED')return {applied:false,idempotent:true,purchaseId};
    if(!['THEME','FRAME','CHALLENGE'].includes(purchase.itemType))throw new Error('Only cosmetics and unstarted challenges can be refunded.');
    const challengeRun=purchase.itemType==='CHALLENGE'?challenges.runByPurchase(purchase.userId,purchase.id):null;
    if(purchase.itemType==='CHALLENGE'&&(!challengeRun||challengeRun.status!=='PENDING'))throw new Error('Only an unstarted pending challenge can be refunded.');
    if(!apply)return {dryRun:true,purchaseId,purchaseType:purchase.itemType,userId:purchase.userId,challengeStatus:challengeRun?.status??null,actor,note};
    const at=gameEngine.clock.now().toISOString();
    return db.transaction(()=>{
      const current=shop.adminPurchase(purchaseId);
      if(!current||current.status!=='COMPLETED')return {applied:false,idempotent:true,purchaseId};
      if(purchase.itemType==='CHALLENGE'&&!challenges.setStatus(purchase.userId,challengeRun.id,'CANCELLED',at))throw new Error('Challenge status changed before refund; no refund was applied.');
      const result=gameEngine.recordSpendRefund({userId:purchase.userId,purchaseId:purchase.id,costXp:purchase.costXp,spendLedgerId:purchase.ledgerEntryId,now:at,reasonCode:'ADMIN_PURCHASE_REFUND',actor:`admin:${actor}`,note});
      if(!shop.refundPurchase(purchase.id))throw new Error('Purchase status changed before refund; transaction rolled back.');
      if(purchase.itemType==='THEME'||purchase.itemType==='FRAME'){
        if(!shop.removeCosmetic(purchase.userId,purchase.itemSlug))throw new Error('Cosmetic ownership changed before refund; transaction rolled back.');
        shop.unequipCosmetic(purchase.userId,purchase.itemSlug,at);
      }
      const data={purchaseId:purchase.id,itemSlug:purchase.itemSlug,itemType:purchase.itemType,refundXp:purchase.costXp,spendableXp:result.spendableXp};
      if(challengeRun){
        const challengeData={runId:challengeRun.id,...data};
        gameEngine.emitRewardEvent('CHALLENGE_CANCELLED',purchase.userId,challengeData,`CHALLENGE:${challengeRun.id}:CANCELLED`);
        challenges.insertNotice({userId:purchase.userId,code:'CHALLENGE_CANCELLED',data:challengeData,createdAt:at,dedupeKey:`CHALLENGE:${challengeRun.id}:NOTICE:CANCELLED`});
        challenges.insertActivity({userId:purchase.userId,kind:'CHALLENGE',id:challengeRun.id,status:'CANCELLED',occurredAt:at,data:challengeData});
      }
      gameEngine.emitRewardEvent('PURCHASE_REFUNDED',purchase.userId,data,`PURCHASE:${purchase.id}:REFUNDED`);
      shop.insertRefundNotice({userId:purchase.userId,id:purchase.id,at,data});
      shop.insertRefundActivity({userId:purchase.userId,id:purchase.id,at,data});
      return {applied:true,...data};
    })();
  }
  return {refund};
}
