import { createBadgeAdminRepository } from '../repositories/badgeAdminRepository.js';

export function createBadgeAdminService({db,gameEngine}) {
  const repository=createBadgeAdminRepository(db);
  function revoke(input,{apply=false}={}) {
    const badge=repository.badge(input.userId,input.slug,input.tier);
    if(!badge)throw new Error('Badge tier not found for user.');
    if(!repository.caseForUser(input.caseId,input.userId))throw new Error('Integrity case does not belong to the specified user.');
    if(badge.status==='REVOKED')return {applied:false,idempotent:true,badge};
    if(!apply)return {dryRun:true,badge,caseId:input.caseId,actor:input.actor,note:input.note};
    const at=gameEngine.clock.now().toISOString();
    return db.transaction(()=>{
      const key=`CASE${input.caseId}:BADGE_REVOKE:${input.userId}:${input.slug}:${input.tier}`;
      if(!repository.action({caseId:input.caseId,actor:`admin:${input.actor}`,note:input.note,payload:{userId:input.userId,slug:input.slug,tier:input.tier},key,at}))return {applied:false,idempotent:true};
      if(!repository.revoke({...input,actor:input.actor,at}))throw new Error('Badge changed before the revocation could be applied.');
      const xp=gameEngine.reconcileBadge({userId:input.userId,slug:input.slug,tier:input.tier,desired:false,reasonCode:'BADGE_REVOKED',note:input.note});
      gameEngine.lockBadge(input.userId,input.slug,input.tier,at,input.caseId);
      repository.notice({userId:input.userId,slug:input.slug,tier:input.tier,at});
      repository.activity({userId:input.userId,slug:input.slug,tier:input.tier,at});
      gameEngine.emitRewardEvent('BADGE_REVOKED',input.userId,{slug:input.slug,tier:input.tier,caseId:input.caseId},`BADGE:${input.userId}:${input.slug}:${input.tier}:REVOKED`);
      return {applied:true,badge:repository.badge(input.userId,input.slug,input.tier),xpReversal:xp?.lifetimeDelta??0};
    })();
  }
  return {revoke};
}
