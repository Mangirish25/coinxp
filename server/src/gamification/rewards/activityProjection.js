const eventKinds = [
  [/^TRANSACTION_/, 'TRANSACTION'], [/^XP_/, 'XP'], [/^STREAK_/, 'STREAK'],
  [/^BADGE_/, 'BADGE'], [/^MISSION_/, 'MISSION'], [/^CHALLENGE_/, 'CHALLENGE'],
  [/^PURCHASE_/, 'PURCHASE'], [/^LEVEL_/, 'LEVEL'],
];

export function activityProjection(eventType,data={}) {
  const kind=eventKinds.find(([pattern])=>pattern.test(eventType))?.[1];
  if(!kind)return null;
  const transaction=data.after??data.before??{};
  const safeData=kind==='TRANSACTION'?{
    transactionId:data.transactionId??transaction.id, action:eventType.replace('TRANSACTION_','').toLowerCase(),
    type:data.after?.type??data.before?.type??null, transactionDate:data.after?.transactionDate??data.before?.transactionDate??null,
    changedFields:data.changedFields??[],
  }:kind==='XP'?{ledgerId:data.ledgerId??null,ruleId:data.ruleId??null,delta:data.delta??null,reasonCode:data.reasonCode??null,level:data.level??null}
    :kind==='LEVEL'?{from:data.from??null,to:data.to??null,title:data.title??null,ledgerId:data.ledgerId??null}
      :kind==='BADGE'?{slug:data.slug??null,tier:data.tier??null,rarity:data.rarity??null,xpAwarded:data.xpAwarded??null,achievedOn:data.achievedOn??null}
        :kind==='MISSION'?{missionId:data.missionId??data.id??null,templateId:data.templateId??null,slot:data.slot??null,periodKey:data.periodKey??null,status:data.status??eventType.replace('MISSION_',''),xpAwarded:data.xpAwarded??null}
          :kind==='CHALLENGE'?{runId:data.runId??data.id??null,challengeSlug:data.challengeSlug??null,status:data.status??eventType.replace('CHALLENGE_',''),qualifyingDays:data.qualifyingDays??null,xpAwarded:data.xpAwarded??null}
            :kind==='PURCHASE'?{purchaseId:data.purchaseId??data.id??null,itemSlug:data.itemSlug??null,itemType:data.itemType??null,status:eventType.replace('PURCHASE_','')}
              :{eventType,streakType:data.streakType??null,localDate:data.localDate??null,current:data.current??null,longest:data.longest??null,milestone:data.milestone??null};
  const refId=safeData.transactionId??safeData.ledgerId??safeData.runId??safeData.missionId??safeData.purchaseId??safeData.slug??'';
  return {kind,summaryCode:eventType,refType:kind,refId:String(refId),data:safeData};
}
