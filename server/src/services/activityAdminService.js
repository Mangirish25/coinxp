import { activityProjection } from '../gamification/rewards/activityProjection.js';
import { createActivityAdminRepository } from '../repositories/activityAdminRepository.js';

export function createActivityAdminService({db,clock={now:()=>new Date()}}) {
  const repository=createActivityAdminRepository(db);
  function entries(sources) {
    const rows=[];
    for(const row of sources.events){
      const projection=activityProjection(row.eventType,row.event.data);
      if(projection)rows.push({source:'events',userId:row.userId,...projection,occurredAt:row.occurredAt,dedupeKey:row.dedupeKey??`ACTIVITY:${row.eventId}`});
    }
    for(const row of sources.audits){
      const action=row.action.toUpperCase();
      rows.push({source:'audits',userId:row.userId,kind:'TRANSACTION',refType:'TRANSACTION',refId:String(row.transactionId),occurredAt:row.occurredAt,
        summaryCode:`TRANSACTION_${action}`,data:{transactionId:row.transactionId,action:action.toLowerCase(),type:row.after?.type??row.before?.type??null,
          transactionDate:row.after?.transactionDate??row.before?.transactionDate??null,changedFields:row.changedFields},dedupeKey:`TXN_AUDIT:${row.id}`});
    }
    for(const row of sources.ledger)rows.push({source:'ledger',userId:row.userId,kind:'XP',refType:'XP_LEDGER',refId:String(row.id),occurredAt:row.occurredAt,
      summaryCode:`XP_${row.entryType}`,data:{ledgerId:row.id,ruleId:row.ruleId,delta:row.delta,reasonCode:row.reasonCode},dedupeKey:`XP_LEDGER:${row.id}`});
    for(const row of sources.purchases)rows.push({source:'purchases',userId:row.userId,kind:'PURCHASE',refType:'PURCHASE',refId:String(row.id),occurredAt:row.occurredAt,
      summaryCode:`PURCHASE_${row.status}`,data:{purchaseId:row.id,itemSlug:row.itemSlug,itemType:row.itemType,status:row.status},dedupeKey:`PURCHASE:${row.id}`});
    return rows;
  }
  function backfill({userId=null,actor,note},{apply=false}={}) {
    const candidates=entries(repository.sources(userId));
    if(!apply)return {dryRun:true,userId,counts:Object.fromEntries(['events','audits','ledger','purchases'].map((source)=>[source,candidates.filter((row)=>row.source===source).length]))};
    return repository.transaction(()=>{
      let inserted=0;
      for(const candidate of candidates){const entry=Object.fromEntries(Object.entries(candidate).filter(([key])=>key!=='source'));if(repository.insert(entry))inserted+=1;}
      const runId=repository.recordRun({userId,actor,note,insertedCount:inserted,createdAt:clock.now().toISOString()});
      return {applied:true,runId,userId,inserted,candidateCount:candidates.length};
    });
  }
  return {backfill};
}
