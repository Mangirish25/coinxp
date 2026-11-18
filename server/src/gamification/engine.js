import { createOutboxRepository, buildEnvelope, enqueue as enqueueRow } from './outbox/outboxRepository.js';
import { createLedgerRepository } from './ledger/ledgerRepository.js';
import { createGamificationFactsRepository } from './ledger/factsRepository.js';
import { createSettlementRepository } from './settlement/settlementRepository.js';
import { localDateAt, shiftDate, weekKey, weekBounds, monthOf, monthStart, monthEnd, localInstantToUtc, weekDateRange } from './dateMath.js';
import { derivedLevel, titleForLevel, levelProgress, levelUpsBetween } from './levels.js';
import { messageForReason } from './messages.js';
import defaultRules, { CONFIG_VERSION } from './rules.config.js';
import { systemClock } from './clock.js';
import { randomUUID } from 'node:crypto';
import { dayCutoff, effectiveBudgetFromHistory, transactionFactsAsOf } from './asOf.js';
import { createTransactionRepository } from '../repositories/transactionRepository.js';
import { createBudgetHistoryRepository } from '../repositories/budgetHistoryRepository.js';
import { httpError } from '../utils/httpError.js';
import { createIntegrityRepository } from '../repositories/integrityRepository.js';
import { responseLadder } from './integrity/risk.js';
import { correctionAmnestyPaise, evaluatedSpendPaise, unexpectedExpensePaise } from './integrity/correction.js';
import { buildBudgetWarnings } from './integrity/warnings.js';
import { createBudgetService } from '../services/budgetService.js';
import { theoreticalMaximum, checkTheoreticalCeiling } from './integrity/ceiling.js';
import { assertRewardCatalog } from './rewards/catalog.js';
import { createRewardRepository } from '../repositories/rewardRepository.js';
import { createBadgeService } from './rewards/badges.js';
import { createMissionRepository } from '../repositories/missionRepository.js';
import { createMissionService } from '../services/missionService.js';
import { createChallengeService } from '../services/challengeService.js';
import { activityProjection } from './rewards/activityProjection.js';

const inbound = new Set([
  'USER_REGISTERED','TIMEZONE_CHANGED','TRANSACTION_CREATED','TRANSACTION_UPDATED','TRANSACTION_DELETED','TRANSACTION_RESTORED',
  'BUDGET_UPSERTED','BUDGET_DELETED','DAILY_REVIEW_COMPLETED',
]);

function safeTotal(value,label='XP') {
  const number=typeof value==='bigint'?value:BigInt(value??0);
  if(number>BigInt(Number.MAX_SAFE_INTEGER)||number<BigInt(Number.MIN_SAFE_INTEGER))throw new RangeError(`${label} exceeds the safe integer range.`);
  return Number(number);
}

function percentageCeiling(numerator,denominator,config) {
  return Number((BigInt(numerator)*BigInt(config.units.basisPoints)+BigInt(denominator)-BigInt(config.units.one))/BigInt(denominator));
}

function addDate(date, days) { return shiftDate(date,days); }

export function createGamificationEngine({ db, clock = systemClock, config = defaultRules, logger = console, enabled = true } = {}) {
  if(!db)throw new Error('createGamificationEngine requires a database connection.');
  assertRewardCatalog(config.rewards);
  const outbox=createOutboxRepository(db);
  const ledger=createLedgerRepository(db);
  const facts=createGamificationFactsRepository(db);
  const settlements=createSettlementRepository(db);
  const transactions=createTransactionRepository(db);
  const budgetHistory=createBudgetHistoryRepository(db);
  const integrity=createIntegrityRepository(db);
  const rewards=createRewardRepository(db);
  const missionRepository=createMissionRepository(db);
  const budgets=createBudgetService({db,gameEngine:{clock}});

  function nowIso(){return clock.now().toISOString();}
  function localDate(userId, instant=clock.now()){
    const user=facts.user(userId); if(!user)throw httpError(401,'UNAUTHENTICATED','Please sign in to continue.');
    return localDateAt(instant,user.timezone);
  }
  const missions = createMissionService({ repository: missionRepository, facts, config, clock, localDate, reconcileKey, publish,
    insertNotice: (notice) => integrity.insertNotice(notice) });
  function recordChallengeReward({userId,slug,xp,award}) {
    if(!award)return null;
    return reconcileKey({userId,key:`MIS-007:${slug}`,ruleId:'MIS-007',periodType:'once',periodKey:slug,desired:true,value:xp,reasonCode:'CHALLENGE_COMPLETED'});
  }
  const challengeEngine = { enabled, clock, rewardConfig:()=>config.rewards, rewardUnits:()=>config.units, localDate,
    settlementConfig:()=>config.settlement,
    purchaseState:(userId)=>{const state=ensureProgress(userId);return {level:state?.maxLevelReached??0,spendableXp:state?.spendableXp??0,lifetimeXp:state?.lifetimeXp??0};},
    recordSpend, recordSpendRefund, recordChallengeReward, emitRewardEvent:(type,userId,data,key)=>publish(type,userId,data,key),
    dependencies:{facts,missions:missionRepository} };
  const challenges = createChallengeService({db,gameEngine:challengeEngine});
  function enqueue(event){
    if(!enabled)return null;
    const envelope=buildEnvelope(event,clock);
    enqueueRow(db,envelope);
    return envelope;
  }
  function publish(eventType,userId,data,dedupeKey){
    const date=localDate(userId);
    const user=facts.user(userId);
    const envelope=buildEnvelope({eventType,userId,data,localDate:date,timezone:user?.timezone},clock);
    enqueueRow(db,envelope,{status:'PUBLISHED',dedupeKey});
    writeActivity(eventType,userId,data,envelope.occurredAt,dedupeKey);
  }

  function writeActivity(eventType,userId,data,occurredAt,dedupeKey) {
    const item=activityProjection(eventType,data);
    if(!item)return;
    try { rewards.insertActivity({userId,kind:item.kind,refType:item.refType,refId:item.refId,occurredAt,summaryCode:item.summaryCode,data:item.data,dedupeKey:dedupeKey??`${eventType}:${userId}:${occurredAt}`}); }
    catch(error) { logger.error?.('Could not update the activity read model.',{eventType,error}); }
  }

  function raiseIntegrityFlag(userId, code, windowKey, evidence) {
    const now = clock.now(); const timestamp = now.toISOString();
    const inserted = ledger.raiseFlag(userId,code,windowKey,evidence,timestamp);
    if (!inserted) return false;
    const from = new Date(now.getTime()-config.integrity.scoring.windowDays*config.units.hoursPerDay*config.units.minutesPerHour*config.units.secondsPerMinute*config.units.millisecondsPerSecond).toISOString();
    const flags = integrity.recentFlags(userId,from);
    const autoSince = new Date(now.getTime()-config.integrity.holds.rollingWindowDays*config.units.hoursPerDay*config.units.minutesPerHour*config.units.secondsPerMinute*config.units.millisecondsPerSecond).toISOString();
    const user = facts.user(userId);
    if (!user) return true;
    const ladder = responseLadder({ flags,accountCreatedAt:user.createdAt,now,autoHoldsLast90Days:integrity.autoHoldCountSince(userId,autoSince) },config);
    if (ladder.nudge) {
      const nudgeSince = new Date(now.getTime()-config.integrity.nudge.minDaysBetween*config.units.hoursPerDay*config.units.minutesPerHour*config.units.secondsPerMinute*config.units.millisecondsPerSecond).toISOString();
      if (integrity.canNudgeSince(userId,nudgeSince)) integrity.insertNotice({userId,kind:'REVIEW',code:'INTEGRITY_NUDGE',data:{},dedupeKey:`INTEGRITY_NUDGE:${userId}:${timestamp.slice(0,10)}`,createdAt:timestamp});
    }
    if (ladder.openCase) {
      const caseId = integrity.openRiskCase({userId,score:ladder.score,distinct:ladder.distinctHoldEligible,createdAt:timestamp});
      integrity.attachRecentFlagsToCase(userId,caseId,from);
      if (ladder.autoHold && !integrity.hasActiveHoldForScope(userId,config.integrity.holds.autoScope,timestamp)) {
        const endsAt = new Date(now.getTime()+config.integrity.holds.autoDurationDays*config.units.hoursPerDay*config.units.minutesPerHour*config.units.secondsPerMinute*config.units.millisecondsPerSecond).toISOString();
        const holdId = integrity.createAutoHold({userId,caseId,startsAt:timestamp,endsAt});
        integrity.insertNotice({userId,kind:'RESTRICTION',code:'HOLD_STARTED',data:{holdUntil:endsAt},dedupeKey:`HOLD_STARTED:${holdId}`,createdAt:timestamp});
      }
    }
    return true;
  }

  function evaluateBudgetWarnings(userId, dailyDate = localDate(userId)) {
    const today=localDate(userId);
    const monthStatus=budgets.status(userId,dailyDate.slice(0,7));
    const daily=budgets.dailyStatus(userId,dailyDate);
    const warnings=buildBudgetWarnings({daily,monthly:monthStatus,today:dailyDate,
      monthStatus:{currentMonth:today.slice(0,7),daysElapsed:monthStatus.daysElapsed},config});
    for(const warning of warnings)integrity.insertNotice({userId,kind:warning.kind,code:warning.code,data:warning.data,
      dedupeKey:warning.dedupeKey,createdAt:nowIso()});
    return warnings;
  }

  function recordIntegritySignal(userId, code, windowKey, evidence = {}) {
    if (!enabled) return false;
    return db.transaction(() => raiseIntegrityFlag(userId,code,windowKey,evidence))();
  }

  function ensureProgress(userId) {
    const user=facts.user(userId); if(!user)return null;
    return ledger.ensureProgress(userId,localDateAt(user.createdAt,user.timezone),nowIso());
  }

  function recordSpend({userId,purchaseId,costXp,itemType,now=nowIso()}) {
    if(!Number.isSafeInteger(costXp)||costXp<0)throw new TypeError('Purchase XP cost must be a non-negative integer.');
    const progress=ensureProgress(userId);
    if(!progress)throw httpError(404,'USER_NOT_FOUND','User not found.');
    if(progress.spendableXp<costXp)throw httpError(422,'INSUFFICIENT_XP','You do not have enough spendable XP for this item.');
    const entryId=ledger.insert({userId,entryType:'SPEND',ruleId:'XP-013',entitlementKey:null,transitionNo:null,
      idempotencyKey:`u${userId}:SPEND:${purchaseId}`,lifetimeDelta:0,balanceDelta:-costXp,periodType:'once',periodKey:`PURCHASE:${purchaseId}`,
      reversesEntryId:null,sourceEventId:null,reasonCode:`PURCHASE_${itemType}`,note:null,configVersion:CONFIG_VERSION,actor:'user',createdAt:now});
    ledger.updateProgress(userId,{lifetimeXp:progress.lifetimeXp,spendableXp:progress.spendableXp-costXp,
      maxLevelReached:progress.maxLevelReached,lastLedgerId:entryId,updatedAt:now});
    return {entryId,spendableXp:progress.spendableXp-costXp,lifetimeXp:progress.lifetimeXp,level:progress.maxLevelReached};
  }

  function recordSpendRefund({userId,purchaseId,costXp,spendLedgerId,now=nowIso(),reasonCode='CHALLENGE_CANCEL_REFUND',actor='system',note=null}) {
    const progress=ensureProgress(userId);
    if(!progress)throw httpError(404,'USER_NOT_FOUND','User not found.');
    const spendableXp=safeTotal(BigInt(progress.spendableXp)+BigInt(costXp),'Spendable XP');
    const entryId=ledger.insert({userId,entryType:'SPEND',ruleId:'XP-013',entitlementKey:null,transitionNo:null,
      idempotencyKey:`u${userId}:SPEND:REFUND:${purchaseId}`,lifetimeDelta:0,balanceDelta:costXp,periodType:'once',periodKey:`REFUND:${purchaseId}`,
      reversesEntryId:spendLedgerId,sourceEventId:null,reasonCode,note,configVersion:CONFIG_VERSION,actor,createdAt:now});
    ledger.updateProgress(userId,{lifetimeXp:progress.lifetimeXp,spendableXp,maxLevelReached:progress.maxLevelReached,lastLedgerId:entryId,updatedAt:now});
    return {entryId,spendableXp,lifetimeXp:progress.lifetimeXp,level:progress.maxLevelReached};
  }

  function awardValue(ruleId) {
    const values={
      'XP-001':config.xp.dailyTracking,'XP-002':config.xp.dailyReview,'XP-003':config.xp.dailyAdherence,
      'XP-004':config.xp.weeklyConsistency,'XP-005':config.xp.monthlyBudgetCompletion,
      'XP-006:FIRST_TRANSACTION':config.xp.onboarding.firstTransaction,
      'XP-006:FIRST_BUDGET':config.xp.onboarding.firstBudget,
      'XP-006:FIRST_REVIEW':config.xp.onboarding.firstReview,
    };
    return values[ruleId]??0;
  }

  function isLocked(userId,key){return ledger.isKeyLocked(userId,key);}

  function reconcileKey({userId,key,ruleId,periodType,periodKey,desired,value=awardValue(ruleId),reasonCode,sourceEventId,note=null}) {
    if(isLocked(userId,key))return null;
    const progress=ensureProgress(userId);
    if(!progress)return null;
    const previous=ledger.latestForKey(userId,key);
    const state=previous===undefined?'NONE':previous.entryType==='REVERSAL'?'REVERSED':'ACTIVE';
    const transitionNo=previous?.transitionNo??0;
    let entryType;
    let delta=0;
    let reversesEntryId=null;
    if(state==='NONE'&&desired){entryType='AWARD';delta=value;}
    else if(state==='ACTIVE'&&!desired){entryType='REVERSAL';const source=ledger.sourceAwardForKey(userId,key);delta=source?.lifetimeDelta??0;delta=-delta;reversesEntryId=previous.id;}
    else if(state==='REVERSED'&&desired){entryType='REINSTATE';const source=ledger.sourceAwardForKey(userId,key);delta=source?.lifetimeDelta??value;}
    else return null;

    if ((entryType === 'AWARD' || entryType === 'REINSTATE') &&
        (['XP-003','XP-004','XP-005'].includes(ruleId) && integrity.hasActiveHoldForScope(userId,'OUTCOME_XP',nowIso()) ||
         ruleId === 'STR-006' && integrity.hasActiveHoldForScope(userId,'STREAK_XP',nowIso()) ||
         ['BAD-003','MIS-004','MIS-007'].includes(ruleId) && integrity.hasActiveHoldForScope(userId,'PROGRESSION_XP',nowIso()))) return null;

    const transitionReasonCode = entryType === 'REVERSAL' && ['XP-001','XP-006:FIRST_TRANSACTION'].includes(ruleId)
      ? 'RECORD_REMOVED'
      : entryType === 'REINSTATE' ? 'RECORD_RESTORED' : reasonCode;

    if(entryType==='AWARD'||entryType==='REINSTATE'){
      if(periodType==='day'&&['XP-001','XP-002','XP-003'].includes(ruleId)){
        const already=ledger.activeAmountForDay(userId,periodKey);
        delta=Math.max(config.units.zero,Math.min(delta,config.xp.dailyRuleCap-already));
      }
      if(delta===config.units.zero)return null;
    }
    const lifetimeDelta=delta;
    const nextLifetime=BigInt(progress.lifetimeXp)+BigInt(lifetimeDelta);
    if(nextLifetime<BigInt(config.units.zero))throw new RangeError('XP reversal would make lifetime XP negative.');
    const lifetimeXp=safeTotal(nextLifetime);
    const spendableXp=safeTotal(BigInt(progress.spendableXp)+BigInt(lifetimeDelta));
    const derived=derivedLevel(lifetimeXp,config);
    const maxLevelReached=Math.max(progress.maxLevelReached,derived);
    const nextNo=transitionNo+config.units.one;
    const idempotencyKey=`u${userId}:${key}#${nextNo}`;
    const entryId=ledger.insert({userId,entryType,ruleId,entitlementKey:key,transitionNo:nextNo,idempotencyKey,
      lifetimeDelta,balanceDelta:lifetimeDelta,periodType,periodKey,reversesEntryId,sourceEventId,reasonCode:transitionReasonCode,
      note,configVersion:CONFIG_VERSION,actor:'system',createdAt:nowIso()});
    ledger.updateProgress(userId,{lifetimeXp,spendableXp,maxLevelReached,lastLedgerId:entryId,updatedAt:nowIso()});
    const outputType=entryType==='REVERSAL'?'XP_DEDUCTED':'XP_EARNED';
    const outputData={ledgerId:entryId,ruleId,entitlementKey:key,delta:lifetimeDelta,reasonCode:transitionReasonCode,message:messageForReason(transitionReasonCode,{limitPaise:note}),lifetimeXp,spendableXp,level:maxLevelReached};
    publish(outputType,userId,outputData,`${outputType}:${userId}:${entryId}`);
    if(ruleId==='XP-003'&&entryType==='REVERSAL'&&transitionReasonCode==='LIMIT_NOW_EXCEEDED')
      integrity.insertNotice({userId,kind:'XP_CHANGE',code:'XP_REVERSED_LIMIT',data:{date:periodKey,ledgerEntryId:entryId},ledgerEntryId:entryId,dedupeKey:`XP:${key}#${nextNo}`,createdAt:nowIso()});
    if(ruleId==='XP-003'&&entryType==='REINSTATE')
      integrity.insertNotice({userId,kind:'XP_CHANGE',code:'XP_REINSTATED',data:{date:periodKey,ledgerEntryId:entryId},ledgerEntryId:entryId,dedupeKey:`XP:${key}#${nextNo}`,createdAt:nowIso()});
    for(const level of levelUpsBetween(progress.maxLevelReached,maxLevelReached)){
      const title=titleForLevel(level,config);
      publish('LEVEL_UP',userId,{from:level-config.units.one,to:level,title,ledgerId:entryId},`LEVEL_UP:${userId}:${level}`);
      const titleBefore=titleForLevel(level-config.units.one,config);
      const titleAfter=titleForLevel(level,config);
      integrity.insertNotice({userId,kind:'PROGRESS',code:'LEVEL_UP',data:{fromLevel:level-config.units.one,toLevel:level,
        titleBefore,titleAfter,titleChanged:titleBefore!==titleAfter,lifetimeXp,progressBps:levelProgress(lifetimeXp,level,config).progressBps},
        dedupeKey:`LEVEL_UP:${userId}:${level}`,createdAt:nowIso()});
    }
    if(nextNo>=config.churn.flagAtTransitions)raiseIntegrityFlag(userId,'HIGH_EDIT_CHURN',localDate(userId),{entitlementKey:key,transitionNo:nextNo});
    if(nextNo>=config.churn.lockAtTransitions){raiseIntegrityFlag(userId,'KEY_LOCKED',localDate(userId),{entitlementKey:key,transitionNo:nextNo});ledger.lockEntitlement(userId,key,'CHURN',nowIso());}
    return {id:entryId,entryType,ruleId,lifetimeDelta,reasonCode:transitionReasonCode,levelUps:levelUpsBetween(progress.maxLevelReached,maxLevelReached).map((level)=>({from:level-config.units.one,to:level,title:titleForLevel(level,config)}))};
  }

  function periodSealed(userId,type,key){
    const settled=settlements.get(userId,type,key); if(!settled)return false;
    const user=facts.user(userId); const today=localDateAt(clock.now(),user.timezone);
    let end=type==='day'?key:type==='week'?weekBounds(key).end:monthEnd(key);
    return end<addDate(today,-config.settlement.sealAfterDays);
  }

  function currentTracked(userId,date){
    const liveCount=facts.currentLiveCount(userId,date,config.tracking.minQualifyingAmountPaise);
    const review=facts.review(userId,date);
    const expenseExists=facts.hasExpense(userId,date);
    const noSpend=Boolean(review?.noSpendDeclared)&&!expenseExists;
    return {tracked:liveCount>0||noSpend,xpTracked:liveCount>0||(noSpend&&Boolean(review?.xpEligible)),liveCount,noSpend,expenseExists};
  }

  function currentExpenseTotal(userId,from,to){
    return facts.currentExpenseTotal(userId,from,to);
  }

  function expenseTotalAsOf(userId,from,to,instant,excludeUnexpected) {
    const rows=facts.auditRowsAsOf(userId,instant);
    const transactions=transactionFactsAsOf(rows,from,to,instant,config.tracking.minQualifyingAmountPaise);
    return transactions.reduce((sum,row)=>sum+(row.type==='expense'&&(!excludeUnexpected||!row.isUnexpected)?row.amountPaise:config.units.zero),config.units.zero);
  }

  function amnestyForSettlement(userId,settlement,from,to,excludeUnexpected) {
    const hours=config.integrity.correction.amnestyHours;
    if(hours<=config.units.zero)return config.units.zero;
    const cutoff=new Date(settlement.details.cutoffAt);
    const windowMs=hours*config.units.hoursPerDay*config.units.minutesPerHour*config.units.secondsPerMinute*config.units.millisecondsPerSecond;
    const endMs=Math.min(clock.now().getTime(),cutoff.getTime()+windowMs);
    const edgeSpend=expenseTotalAsOf(userId,from,to,new Date(endMs).toISOString(),excludeUnexpected);
    const base=excludeUnexpected
      ? settlement.details.adherencePaise ?? Math.max(config.units.zero,settlement.details.expensePaise-(settlement.details.unexpectedPaise??config.units.zero))
      : settlement.details.expensePaise;
    return correctionAmnestyPaise(edgeSpend,base,clock.now(),settlement.details.cutoffAt);
  }

  function reconcileSettledDay(userId,date,sourceEventId){
    const settlement=settlements.get(userId,'day',date); if(!settlement||periodSealed(userId,'day',date))return null;
    const key=`XP-003:${date}`;
    const tracked=currentTracked(userId,date).xpTracked;
    const currentSpend=facts.currentAdherenceSpend(userId,date,date);
    const amnesty=amnestyForSettlement(userId,settlement,date,date,true);
    const spent=evaluatedSpendPaise(currentSpend,amnesty);
    const desired=settlement.outcome==='PASS'&&tracked&&spent<=settlement.details.limitPaise;
    const reasonCode=desired?'DAILY_ADHERENCE':settlement.outcome==='PASS'&&!tracked?'NO_LONGER_TRACKED':'LIMIT_NOW_EXCEEDED';
    if(amnesty>config.units.zero)integrity.insertNotice({userId,kind:'XP_CHANGE',code:'CORRECTION_NO_XP_CHANGE',data:{date},dedupeKey:`XP:XP-003:${date}:AMNESTY`,createdAt:nowIso()});
    return reconcileKey({userId,key,ruleId:'XP-003',periodType:'day',periodKey:date,desired,
      reasonCode,sourceEventId,note:String(settlement.details.limitPaise??'')});
  }

  function reconcileReview(userId,date,sourceEventId){
    const review=facts.review(userId,date);
    if(!review||periodSealed(userId,'day',date))return null;
    const stillEligible=Boolean(review.xpEligible)&&(
      review.noSpendDeclared===1?!facts.hasExpense(userId,date):facts.currentLiveCount(userId,date,config.tracking.minQualifyingAmountPaise)>0
    );
    return reconcileKey({userId,key:`XP-002:${date}`,ruleId:'XP-002',periodType:'day',periodKey:date,desired:stillEligible,
      reasonCode:stillEligible?'DAILY_REVIEW_COMPLETED':'NO_LONGER_TRACKED',sourceEventId});
  }

  function reconcileSettledWeek(userId,key,sourceEventId){
    const settlement=settlements.get(userId,'week',key); if(!settlement||periodSealed(userId,'week',key))return null;
    const {start,end}=weekBounds(key); const eligibleDates=weekDateRange(start,end).filter((date)=>date>=userProgressStart(userId));
    const count=eligibleDates.filter((date)=>currentTracked(userId,date).xpTracked).length;
    const desired=settlement.outcome==='PASS'&&count>=settlement.details.requiredTracked;
    return reconcileKey({userId,key:`XP-004:${key}`,ruleId:'XP-004',periodType:'week',periodKey:key,desired,
      reasonCode:desired?'WEEKLY_CONSISTENCY':'NO_LONGER_TRACKED',sourceEventId});
  }

  function userProgressStart(userId){return ledger.progress(userId)?.gamificationStartDate??localDate(userId);}

  function reconcileSettledMonth(userId,month,sourceEventId){
    const settlement=settlements.get(userId,'month',month); if(!settlement||periodSealed(userId,'month',month))return null;
    const startDate=monthStart(`${month}-01`); const eligibleDates=weekDateRange(startDate,monthEnd(month)).filter((date)=>date>=userProgressStart(userId));
    const count=eligibleDates.filter((date)=>currentTracked(userId,date).xpTracked).length;
    const currentSpend=currentExpenseTotal(userId,startDate,monthEnd(month));
    const amnesty=amnestyForSettlement(userId,settlement,startDate,monthEnd(month),false);
    const spent=evaluatedSpendPaise(currentSpend,amnesty);
    const desired=settlement.outcome==='PASS'&&count>=settlement.details.requiredTracked&&spent<=settlement.details.budgetPaise;
    const reasonCode=desired?'MONTHLY_BUDGET_COMPLETION':count<settlement.details.requiredTracked?'NO_LONGER_TRACKED':'LIMIT_NOW_EXCEEDED';
    return reconcileKey({userId,key:`XP-005:${month}`,ruleId:'XP-005',periodType:'month',periodKey:month,desired,reasonCode,sourceEventId,note:String(settlement.details.budgetPaise??'')});
  }

  function reviewNoSpendEligible(userId,date,weekStart) {
    if(facts.hasExpense(userId,date))return false;
    return facts.reviewCountWeek(userId,weekStart,date)<config.tracking.noSpendDeclarationsPerWeekCap;
  }

  function dailyLimitAsOf(userId,date,timezone){
    const instant=localInstantToUtc(date,config.units.zero,timezone);
    const history=facts.budgetHistory(userId,instant);
    return effectiveBudgetFromHistory(history,'daily_limit',null,monthOf(date),instant);
  }

  function monthlyBudgetAsOf(userId,month,timezone){
    const start=monthStart(`${month}-01`); const instant=localInstantToUtc(start,config.units.zero,timezone);
    const history=facts.budgetHistory(userId,instant);
    return effectiveBudgetFromHistory(history,'monthly_total',null,month,instant);
  }

  function dailyBaseline(userId,date){
    const from=addDate(date,-config.guards.limitRealism.dailyLookbackDays);
    const entries=settlements.list(userId,'day',from,addDate(date,-config.units.one));
    const amounts=entries.filter((entry)=>entry.outcome!=='INELIGIBLE'&&entry.details.xpTracked&&entry.details.expensePaise>config.units.zero).map((entry)=>entry.details.expensePaise);
    if(amounts.length<config.guards.limitRealism.dailyMinBaselineDays)return null;
    return Number(amounts.reduce((sum,value)=>sum+BigInt(value),0n)/BigInt(amounts.length));
  }

  function monthlyBaseline(userId,month){
    const [year,number]=month.split('-').map(Number); const months=[];
    for(let offset=config.units.one;offset<=config.guards.limitRealism.monthlyLookbackMonths;offset+=config.units.one){
      const date=new Date(Date.UTC(year,number-config.units.one-offset,config.units.one)); const key=`${date.getUTCFullYear()}-${String(date.getUTCMonth()+config.units.one).padStart(config.units.two,'0')}`;
      const row=settlements.get(userId,'month',key); if(row&&row.details.trackedShareBps>=config.guards.limitRealism.monthlyMinTrackedShareBps&&row.details.expensePaise>config.units.zero)months.push(row.details.expensePaise);
    }
    if(months.length<config.guards.limitRealism.monthlyMinMonths)return null;
    return Number(months.reduce((sum,value)=>sum+BigInt(value),0n)/BigInt(months.length));
  }

  function settleDay(userId,date,timezone){
    if(settlements.get(userId,'day',date))return null;
    const cutoff=dayCutoff(date,timezone,config,localInstantToUtc);
    const userStart=ledger.progress(userId)?.gamificationStartDate;
    const reviews=facts.review(userId,date);
    const audit=facts.auditRowsAsOf(userId,cutoff);
    const asOfFacts=transactionFactsAsOf(audit,date,date,cutoff,config.tracking.minQualifyingAmountPaise);
    const active=asOfFacts.filter((item)=>item.transactionDate===date);
    const expensePaise=safeTotal(active.filter((item)=>item.type==='expense').reduce((sum,item)=>sum+BigInt(item.amountPaise),0n),'Expense total');
    const unexpectedPaise=safeTotal(unexpectedExpensePaise(active),'Unexpected expense total');
    const adherencePaise=expensePaise-unexpectedPaise;
    const liveCount=active.filter((item)=>item.live).length;
    const noSpend=Boolean(reviews?.noSpendDeclared)&&!active.some((item)=>item.type==='expense');
    const tracked=liveCount>0||noSpend;
    const xpTracked=liveCount>0||(noSpend&&Boolean(reviews?.xpEligible));
    const limit=dailyLimitAsOf(userId,date,timezone);
    const baseline=dailyBaseline(userId,date);
    let outcome='INELIGIBLE'; let reasonCode='NOT_TRACKED';
    if(userStart&&date<userStart){reasonCode='BEFORE_GAMIFICATION_START';}
    else if(!limit){reasonCode='NO_LIMIT';}
    else if(!tracked){reasonCode='NOT_TRACKED';}
    else if(noSpend&&!reviews?.xpEligible){reasonCode='NO_SPEND_CAP';}
    else if(config.guards.limitRealism.enabled&&baseline!==null&&BigInt(limit.amountPaise)>BigInt(config.guards.limitRealism.factor)*BigInt(baseline)){reasonCode='LIMIT_NOT_MEANINGFUL';}
    else if(xpTracked){outcome=adherencePaise<=limit.amountPaise?'PASS':'FAIL';reasonCode=outcome==='PASS'?'DAILY_ADHERENCE':'LIMIT_EXCEEDED';}
    const noSpendDeclared=Boolean(reviews?.noSpendDeclared);
    const details={limitPaise:limit?.amountPaise??null,limitSource:limit?.source??null,expensePaise,unexpectedPaise,adherencePaise,liveCount,tracked,xpTracked,noSpend,noSpendDeclared,xpEligible:reviews?.xpEligible===1,baselinePaise:baseline,cutoffAt:cutoff,requiredTracked:null};
    const inserted=settlements.insert({userId,periodType:'day',periodKey:date,outcome,reasonCode,details,settledAt:nowIso(),ruleVersion:CONFIG_VERSION});
    if(inserted){publish('DAY_SETTLED',userId,{periodType:'day',periodKey:date,outcome,tracked:xpTracked,xpTracked,noSpendDeclared},`DAY_SETTLED:${userId}:${date}`);}
    evaluateBudgetWarnings(userId,date);
    if(outcome==='PASS')return reconcileKey({userId,key:`XP-003:${date}`,ruleId:'XP-003',periodType:'day',periodKey:date,desired:true,reasonCode:'DAILY_ADHERENCE',sourceEventId:null,note:String(limit.amountPaise)});
    return null;
  }

  function settleWeek(userId,key){
    if(settlements.get(userId,'week',key))return null;
    const {start,end}=weekBounds(key); const userStart=userProgressStart(userId); const dates=weekDateRange(start,end).filter((date)=>date>=userStart);
    if(dates.length<config.weekly.minEligibleDays)return settlements.insert({userId,periodType:'week',periodKey:key,outcome:'INELIGIBLE',reasonCode:'TOO_FEW_DAYS',details:{eligibleDays:dates.length,requiredTracked:config.units.zero,xpTrackedDays:config.units.zero},settledAt:nowIso(),ruleVersion:CONFIG_VERSION});
    const days=settlements.list(userId,'day',start,end);
    const trackedDays=days.filter((entry)=>entry.details.xpTracked).length;
    const required=percentageCeiling(config.weekly.requiredTrackedDays*dates.length,config.weekly.daysPerWeek,config);
    const outcome=trackedDays>=required?'PASS':'FAIL';
    const inserted=settlements.insert({userId,periodType:'week',periodKey:key,outcome,reasonCode:outcome==='PASS'?'WEEKLY_CONSISTENCY':'LOW_TRACKING',details:{eligibleDays:dates.length,requiredTracked:required,xpTrackedDays:trackedDays},settledAt:nowIso(),ruleVersion:CONFIG_VERSION});
    if(inserted)publish('WEEK_SETTLED',userId,{periodType:'week',periodKey:key,outcome,tracked:trackedDays>0},`WEEK_SETTLED:${userId}:${key}`);
    if(outcome==='PASS')return reconcileKey({userId,key:`XP-004:${key}`,ruleId:'XP-004',periodType:'week',periodKey:key,desired:true,reasonCode:'WEEKLY_CONSISTENCY'});
    return null;
  }

  function settleMonth(userId,month,timezone){
    if(settlements.get(userId,'month',month))return null;
    const start=monthStart(`${month}-01`); const end=monthEnd(month); const userStart=userProgressStart(userId);
    const dates=weekDateRange(start,end).filter((date)=>date>=userStart); const budget=monthlyBudgetAsOf(userId,month,timezone);
    const dayRows=settlements.list(userId,'day',start,end); const trackedDays=dayRows.filter((entry)=>entry.details.xpTracked).length;
    const required=percentageCeiling(config.monthly.minTrackedShareBps*dates.length,config.units.basisPoints,config);
    const nextMonthStart=addDate(end,config.units.one); const cutoff=localInstantToUtc(nextMonthStart,config.settlement.cutoffLocalHour,timezone);
    const audit=facts.auditRowsAsOf(userId,cutoff); const asOfFacts=transactionFactsAsOf(audit,start,end,cutoff,config.tracking.minQualifyingAmountPaise);
    const expensePaise=safeTotal(asOfFacts.filter((row)=>row.type==='expense').reduce((sum,row)=>sum+BigInt(row.amountPaise),0n),'Monthly expense total');
    const unexpectedPaise=safeTotal(unexpectedExpensePaise(asOfFacts),'Unexpected expense total');
    const trackedShareBps=dates.length?Math.floor((trackedDays*config.units.basisPoints)/dates.length):config.units.zero;
    const baseline=monthlyBaseline(userId,month);
    let outcome='INELIGIBLE';let reasonCode='NO_BUDGET';
    if(dates.length<config.monthly.minEligibleDays)reasonCode='TOO_FEW_DAYS';
    else if(!budget||budget.amountPaise===config.units.zero)reasonCode='NO_BUDGET';
    else if(trackedDays<required)reasonCode='LOW_TRACKING';
    else if(config.guards.limitRealism.enabled&&baseline!==null&&BigInt(budget.amountPaise)>BigInt(config.guards.limitRealism.factor)*BigInt(baseline))reasonCode='BUDGET_NOT_MEANINGFUL';
    else{outcome=expensePaise<=budget.amountPaise?'PASS':'FAIL';reasonCode=outcome==='PASS'?'MONTHLY_BUDGET_COMPLETION':'BUDGET_EXCEEDED';}
    const details={budgetPaise:budget?.amountPaise??null,budgetSource:budget?.source??null,expensePaise,unexpectedPaise,trackedDays,eligibleDays:dates.length,requiredTracked:required,trackedShareBps,baselinePaise:baseline,cutoffAt:cutoff};
    const inserted=settlements.insert({userId,periodType:'month',periodKey:month,outcome,reasonCode,details,settledAt:nowIso(),ruleVersion:CONFIG_VERSION});
    if(inserted)publish('MONTH_SETTLED',userId,{periodType:'month',periodKey:month,outcome,tracked:trackedDays>0},`MONTH_SETTLED:${userId}:${month}`);
    if(outcome==='PASS')return reconcileKey({userId,key:`XP-005:${month}`,ruleId:'XP-005',periodType:'month',periodKey:month,desired:true,reasonCode:'MONTHLY_BUDGET_COMPLETION',note:String(budget.amountPaise)});
    return null;
  }

  function closeThrough(userId,instant=clock.now()){
    const user=facts.user(userId); const shifted=new Date(instant.getTime()-config.settlement.lateWindowHours*config.units.minutesPerHour*config.units.secondsPerMinute*config.units.millisecondsPerSecond);
    return shiftDate(localDateAt(shifted,user.timezone),-config.units.one);
  }

  function publishStreak(eventType,userId,data,dedupeKey,occurredAt=nowIso()) {
    if (!enabled) return null;
    const user=facts.user(userId);
    const eventDate=localDateAt(new Date(occurredAt),user?.timezone??'UTC');
    const envelope=buildEnvelope({eventType,userId,data,occurredAt,localDate:eventDate,timezone:user?.timezone},clock);
    enqueueRow(db,envelope,{status:'PUBLISHED',dedupeKey});
    writeActivity(eventType,userId,data,occurredAt,dedupeKey);
    const celebrationByEvent = {
      STREAK_STARTED: { code: 'STREAK_STARTED', data: { date: data.date, runId: data.runId } },
      STREAK_MILESTONE_REACHED: { code: 'STREAK_MILESTONE', data: { milestone: data.milestone, length: data.milestone, xp: data.xp } },
      STREAK_FREEZE_USED: { code: 'STREAK_FREEZE_USED', data: { date: data.date, inventoryAfter: data.inventoryAfter, length: data.length } },
      STREAK_BROKEN: { code: 'STREAK_BROKEN', data: { lengthAtEnd: data.lengthAtEnd, date: data.date, comebackEligibleUntil: data.comebackEligibleUntil } },
      STREAK_RESTORED: { code: 'STREAK_RESTORED', data: { fromLength: data.fromLength, toLength: data.toLength } },
    }[eventType];
    if (celebrationByEvent) integrity.insertNotice({ userId, kind: 'STREAK', code: celebrationByEvent.code,
      data: celebrationByEvent.data, dedupeKey: `CELEBRATION:${userId}:${dedupeKey}`, createdAt: occurredAt });
    return envelope;
  }

  function awardStreakMilestone({userId,milestone,xp,date,runId}) {
    return reconcileKey({userId,key:`STR-006:TRACKING_DAILY:${milestone}`,ruleId:'STR-006',periodType:'once',
      periodKey:`TRACKING_DAILY:${milestone}`,desired:true,value:xp,reasonCode:'STREAK_MILESTONE',
      sourceEventId:null,note:`${date};run:${runId}`});
  }

  function settleUser(userId){
    if(!enabled)return {settled:config.units.zero};
    const user=facts.user(userId); if(!user)return {settled:config.units.zero};
    ensureProgress(userId);
    const through=closeThrough(userId);
    const progress=ledger.progress(userId);
    const accountStart=progress.gamificationStartDate??localDateAt(user.createdAt,user.timezone);
    const earliest=accountStart<addDate(through,-config.settlement.sealAfterDays)?addDate(through,-config.settlement.sealAfterDays):accountStart;
    const dates=facts.candidateDates(userId,earliest,through);
    let settledCount=config.units.zero;
    for(const date of dates){
      db.transaction(()=>{settleDay(userId,date,user.timezone);})(); settledCount+=config.units.one;
    }
    const startWeek=weekKey(earliest); const endWeek=weekKey(through);
    let weekCursor=weekBounds(startWeek).start;
    const throughWeekEnd=weekBounds(endWeek).end;
    while(weekCursor<=throughWeekEnd){
      const key=weekKey(weekCursor); const bounds=weekBounds(key);
      if(bounds.end<=through){db.transaction(()=>settleWeek(userId,key))();settledCount+=config.units.one;}
      weekCursor=shiftDate(weekCursor,config.weekly.daysPerWeek);
    }
    let monthCursor=monthOf(earliest); const throughMonth=monthOf(through);
    while(monthCursor<=throughMonth){
      if(monthEnd(monthCursor)<=through){db.transaction(()=>settleMonth(userId,monthCursor,user.timezone))();settledCount+=config.units.one;}
      const [year,month]=monthCursor.split('-').map(Number);const next=new Date(Date.UTC(year,month,config.units.one));monthCursor=`${next.getUTCFullYear()}-${String(next.getUTCMonth()+config.units.one).padStart(config.units.two,'0')}`;
    }
    ledger.updateLastSettled(userId,through,nowIso());
    return {settled:settledCount,through};
  }

  function isPeriodPass(userId,type,key){return settlements.get(userId,type,key)?.outcome==='PASS';}

  function reconcileTransaction(userId,event){
    ensureProgress(userId);
    const before=event.data.before??null;const after=event.data.after??null;
    const dates=new Set([before?.transactionDate,after?.transactionDate,event.data.transactionDate].filter(Boolean));
    const results=[];
    for(const date of dates){
      if(!periodSealed(userId,'day',date)){
        results.push(reconcileKey({userId,key:`XP-001:${date}`,ruleId:'XP-001',periodType:'day',periodKey:date,
          desired:facts.currentLiveCount(userId,date,config.tracking.minQualifyingAmountPaise)>0,reasonCode:'TRANSACTION_TRACKED',sourceEventId:event.eventId}));
      }
      results.push(reconcileReview(userId,date,event.eventId));
      results.push(reconcileSettledDay(userId,date,event.eventId));
      const week=weekKey(date);
      if(isPeriodPass(userId,'week',week))results.push(reconcileSettledWeek(userId,week,event.eventId));
      const month=monthOf(date);
      if(isPeriodPass(userId,'month',month))results.push(reconcileSettledMonth(userId,month,event.eventId));
    }
    const firstTransactionStillLive=facts.hasLiveTransaction(userId,config.tracking.minQualifyingAmountPaise);
    results.push(reconcileKey({userId,key:'XP-006:FIRST_TRANSACTION',ruleId:'XP-006:FIRST_TRANSACTION',periodType:'once',periodKey:'FIRST_TRANSACTION',desired:firstTransactionStillLive,
      reasonCode:firstTransactionStillLive?'FIRST_TRANSACTION':'RECORD_REMOVED',sourceEventId:event.eventId}));
    return results.filter(Boolean);
  }

  function processInbound(event){
    if(!inbound.has(event.eventType))return [];
    ensureProgress(event.userId);
    switch(event.eventType){
      case 'USER_REGISTERED': return [];
      case 'TIMEZONE_CHANGED': {
        const since=new Date(clock.now().getTime()-config.timezone.observationWindowDays*config.units.hoursPerDay*config.units.minutesPerHour*config.units.secondsPerMinute*config.units.millisecondsPerSecond).toISOString();
        if(outbox.countEventTypeSince(event.userId,'TIMEZONE_CHANGED',since)>=config.timezone.flagChangeCount)
          raiseIntegrityFlag(event.userId,'TZ_HOPPING',event.localDate,{recentChanges:outbox.countEventTypeSince(event.userId,'TIMEZONE_CHANGED',since),threshold:config.timezone.flagChangeCount});
        return [];
      }
      case 'TRANSACTION_CREATED': case 'TRANSACTION_UPDATED': case 'TRANSACTION_DELETED': case 'TRANSACTION_RESTORED': {
        writeActivity(event.eventType,event.userId,event.data,event.occurredAt,`ACTIVITY:${event.eventId}`);
        const result=reconcileTransaction(event.userId,event);
        if(event.eventType==='TRANSACTION_CREATED'){
          const since=new Date(clock.now().getTime()-config.units.hoursPerDay*config.units.minutesPerHour*config.units.secondsPerMinute*config.units.millisecondsPerSecond).toISOString();
          if(transactions.countNonLiveCreatedSince(event.userId,since,config.tracking.minQualifyingAmountPaise)>=config.rateLimits.bulkBackfillThreshold)
            raiseIntegrityFlag(event.userId,'BULK_BACKFILL',event.localDate,{threshold:config.rateLimits.bulkBackfillThreshold});
        }
        const affectedDate=event.data.after?.transactionDate??event.data.before?.transactionDate??event.localDate;
        if(affectedDate===localDate(event.userId))evaluateBudgetWarnings(event.userId,affectedDate);
        return result;
      }
      case 'BUDGET_UPSERTED': {
        const result=[];
        if(event.data.created)result.push(reconcileKey({userId:event.userId,key:'XP-006:FIRST_BUDGET',ruleId:'XP-006:FIRST_BUDGET',periodType:'once',periodKey:'FIRST_BUDGET',desired:true,reasonCode:'FIRST_BUDGET',sourceEventId:event.eventId}));
        if(event.data.oldAmountPaise!==null&&event.data.newAmountPaise>event.data.oldAmountPaise&&event.data.scope!=='daily_limit'){
          const relevant=event.data.month??event.localDate;
          const range=monthOf(relevant);
          if(settlements.get(event.userId,'month',range)?.outcome==='FAIL')raiseIntegrityFlag(event.userId,'LIMIT_RAISED_AFTER_FAIL',event.localDate,{scope:event.data.scope,month:range});
        }
        evaluateBudgetWarnings(event.userId,localDate(event.userId));
        return result.filter(Boolean);
      }
      case 'BUDGET_DELETED': return [];
      case 'DAILY_REVIEW_COMPLETED': {
        const result=[];
        if(event.data.xpEligible)result.push(reconcileKey({userId:event.userId,key:`XP-002:${event.localDate}`,ruleId:'XP-002',periodType:'day',periodKey:event.localDate,desired:true,reasonCode:'DAILY_REVIEW_COMPLETED',sourceEventId:event.eventId}));
        result.push(reconcileKey({userId:event.userId,key:'XP-006:FIRST_REVIEW',ruleId:'XP-006:FIRST_REVIEW',periodType:'once',periodKey:'FIRST_REVIEW',desired:true,reasonCode:'FIRST_REVIEW',sourceEventId:event.eventId}));
        return result.filter(Boolean);
      }
      default:return [];
    }
  }

  const badges = createBadgeService({ db, repository: rewards, config, clock, localDate, reconcileKey, publish,
    insertNotice: (notice) => integrity.insertNotice(notice) });

  function processUser(userId){
    if(!enabled)return null;
    const entries=[];let levelUps=[];
    for(let processed=0;processed<config.events.workerBatchSize;processed+=config.units.one){
      const row=outbox.nextForUser(userId,nowIso()); if(!row)break;
      try{
        let effect=[];
        db.transaction(()=>{
          const user=facts.user(userId);
          if(!user){outbox.markSkipped(row.seq,nowIso());return;}
          effect=processInbound(row.payload);
          outbox.markProcessed(row.seq,nowIso());
        })();
        for(const item of effect){if(item)entries.push({ruleId:item.ruleId,delta:item.lifetimeDelta,reasonCode:item.reasonCode,message:messageForReason(item.reasonCode)});if(item?.levelUps?.length)levelUps.push(...item.levelUps);}
      }catch(error){
        const attempts=row.attempts+config.units.one;const dead=attempts>=config.retry.maxAttempts;
        const backoff=config.retry.backoffSeconds[Math.min(attempts-config.units.one,config.retry.backoffSeconds.length-config.units.one)];
        const next=new Date(clock.now().getTime()+backoff*config.units.millisecondsPerSecond).toISOString();
        outbox.markFailed(row.seq,attempts,next,error?.message??error,dead);
        try{logger.error?.(`Gamification event ${row.eventId} failed${dead?' permanently':''}.`,error);}catch{ /* logger failures are ignored */ }
      }
    }
    const progress=ledger.progress(userId);
    if(!progress)return null;
    try { badges.evaluate(userId); }
    catch(error){ try{logger.error?.(`Badge evaluation failed for user ${userId}.`,error);}catch{/* logger failures are ignored */} }
    const refreshedProgress=ledger.progress(userId)??progress;
    const level=refreshedProgress.maxLevelReached;
    return {xpDelta:entries.reduce((sum,item)=>sum+item.delta,config.units.zero),lifetimeXp:refreshedProgress.lifetimeXp,spendableXp:refreshedProgress.spendableXp,level,
      title:titleForLevel(level,config),levelUp:levelUps.at(-1)??null,entries};
  }

  function createReview(userId,{noSpend=false}){
    if(!enabled)throw httpError(503,'GAMIFICATION_DISABLED','Gamification is currently unavailable.');
    const user=facts.user(userId);if(!user)throw httpError(401,'UNAUTHENTICATED','Please sign in to continue.');
    const now=clock.now();const date=localDateAt(now,user.timezone);const existing=facts.review(userId,date);
    if(existing)return {review:{localDate:existing.localDate,completed:true,noSpend:Boolean(existing.noSpendDeclared),xpEligible:Boolean(existing.xpEligible),summary:JSON.parse(existing.summaryJson)},status:200,gamification:null};
    const liveCount=facts.currentLiveCount(userId,date,config.tracking.minQualifyingAmountPaise);const hasExpense=facts.hasExpense(userId,date);
    if(liveCount===0&&(!noSpend||hasExpense))throw httpError(422,'REVIEW_NOT_AVAILABLE','Log a qualifying transaction today, or declare no spending when you had no expenses today.');
    const start=weekBounds(weekKey(date)).start;const xpEligible=noSpend?reviewNoSpendEligible(userId,date,start):liveCount>0;
    const summary={liveCount,expenseExists:hasExpense,noSpendDeclared:noSpend,xpEligible};
    const queued=db.transaction(()=>{
      const inserted=facts.insertReview({userId,date,completedAt:now.toISOString(),noSpend,xpEligible,summary});
      if(!inserted.inserted)return {review:inserted.review,created:false};
      const event=enqueue({eventType:'DAILY_REVIEW_COMPLETED',userId,occurredAt:now.toISOString(),localDate:date,timezone:user.timezone,data:{noSpend,xpEligible,summary}});
      return {review:inserted.review,created:true,event};
    })();
    const gamification=queued.created?processUser(userId):null;
    return {review:{localDate:date,completed:true,noSpend:Boolean(queued.review.noSpendDeclared),xpEligible:Boolean(queued.review.xpEligible),summary},status:queued.created?201:200,gamification};
  }

  function dailyReviewStatus(userId){
    const user=facts.user(userId);if(!user)throw httpError(401,'UNAUTHENTICATED','Please sign in to continue.');
    const date=localDateAt(clock.now(),user.timezone);const review=facts.review(userId,date);
    const liveCount=facts.currentLiveCount(userId,date,config.tracking.minQualifyingAmountPaise);const expense=facts.hasExpense(userId,date);
    const start=weekBounds(weekKey(date)).start;const used=facts.reviewCountWeek(userId,start,date);
    const capRemaining=Math.max(config.units.zero,config.tracking.noSpendDeclarationsPerWeekCap-used);
    const blockers=[];
    if(!review&&liveCount===0&&expense){blockers.push('NO_QUALIFYING_TRANSACTION','EXPENSE_EXISTS_FOR_NO_SPEND');}
    else if(!review&&liveCount===0&&capRemaining===0){blockers.push('NO_QUALIFYING_TRANSACTION','NO_SPEND_CAP_EXHAUSTED');}
    return {localDate:date,completed:Boolean(review),available:Boolean(review)||liveCount>0||(!expense&&capRemaining>0),blockers,
      trackingCredited:Boolean(ledger.latestForKey(userId,`XP-001:${date}`)&&ledger.latestForKey(userId,`XP-001:${date}`).entryType!=='REVERSAL'),
      noSpendCapRemaining:capRemaining,hasExpense:expense,liveTransactionCount:liveCount,
      review:review?{noSpend:Boolean(review.noSpendDeclared),xpEligible:Boolean(review.xpEligible)}:null};
  }

  function awardSummary(userId){
    const progress=ensureProgress(userId);if(!progress)return null;
    const today=dailyReviewStatus(userId);const level=progress.maxLevelReached;const progressFields=levelProgress(progress.lifetimeXp,level,config);
    const settlementPending=progress.lastSettledDate!==closeThrough(userId);
    const unseen=ledger.unseen(userId,progress.lastSeenLedgerId);
    return {lifetimeXp:progress.lifetimeXp,spendableXp:progress.spendableXp,level,title:titleForLevel(level,config),nextTitle:level>=config.levels.maxLevel?null:titleForLevel(level+config.units.one)||null,
      ...progressFields,today:{trackingCredited:today.trackingCredited,reviewCompleted:today.completed,noSpendCapRemaining:today.noSpendCapRemaining},
      unseen:collapseUnseen(unseen),lastEntries:ledger.lastEntries(userId,config.pagination.summaryLedgerCount).map((entry)=>({...entry,message:messageForReason(entry.reasonCode)})),
      settlement:{lastSettledDate:progress.lastSettledDate,pending:settlementPending}};
  }

  function collapseUnseen(rows){
    const groups=new Map();for(const row of rows){const key=row.entitlementKey??`ledger:${row.id}`;const list=groups.get(key)??[];list.push(row);groups.set(key,list);}
    const result=[];for(const list of groups.values()){
      const delta=list.reduce((sum,row)=>sum+row.delta,config.units.zero);
      if(delta===config.units.zero&&list.length>config.units.one)continue;
      const row=list.at(-1);result.push({...row,delta,message:messageForReason(row.reasonCode)});
    }
    return result.sort((a,b)=>a.id-b.id);
  }

  function acknowledgeFeed(userId,upToLedgerId){
    const progress=ensureProgress(userId);if(!progress)throw httpError(401,'UNAUTHENTICATED','Please sign in to continue.');
    const max=ledger.lastEntries(userId,config.events.workerBatchSize).reduce((current,row)=>Math.max(current,row.id),progress.lastSeenLedgerId);
    if(upToLedgerId>max||upToLedgerId>progress.lastSeenLedgerId&&!ledger.ownsLedgerId(userId,upToLedgerId))throw httpError(422,'INVALID_LEDGER_CURSOR','Feed cursor is not part of your ledger.');
    ledger.acknowledge(userId,upToLedgerId,nowIso());return {lastSeenLedgerId:Math.max(progress.lastSeenLedgerId,upToLedgerId)};
  }

  function summary(userId){
    processUser(userId);return awardSummary(userId);
  }

  function ledgerPage(userId,input){
    const {rows,total}=ledger.list(userId,input);
    return {data:rows.map((entry)=>({...entry,message:messageForReason(entry.reasonCode)})),pagination:{page:input.page,pageSize:input.pageSize,total,totalPages:Math.ceil(total/input.pageSize)}};
  }

  function rebuildCache(userId){
    ensureProgress(userId);
    const totals=ledger.totals(userId);const rows=ledger.lastEntries(userId,config.events.workerBatchSize);
    const level=Math.max(ledger.progress(userId).maxLevelReached,derivedLevel(totals.lifetimeXp,config));
    ledger.rebuildProgress(userId,{lifetimeXp:totals.lifetimeXp,spendableXp:totals.spendableXp,maxLevelReached:level,lastLedgerId:totals.lastLedgerId,updatedAt:nowIso()});
    return {progress:ledger.progress(userId),verifiedRows:rows.length};
  }

  function reconcileRange(userId, from, to) {
    const changed=[];
    for (const date of weekDateRange(from,to)) {
      db.transaction(() => {
        if (!periodSealed(userId,'day',date)) changed.push(reconcileKey({ userId, key:`XP-001:${date}`, ruleId:'XP-001', periodType:'day', periodKey:date,
          desired:facts.currentLiveCount(userId,date,config.tracking.minQualifyingAmountPaise)>0, reasonCode:'RECORD_REMOVED' }));
        changed.push(reconcileSettledDay(userId,date,null));
        const week=weekKey(date); if(isPeriodPass(userId,'week',week)) changed.push(reconcileSettledWeek(userId,week,null));
        const month=monthOf(date); if(isPeriodPass(userId,'month',month)) changed.push(reconcileSettledMonth(userId,month,null));
      })();
    }
    db.transaction(() => {
      const firstTransaction=facts.hasLiveTransaction(userId,config.tracking.minQualifyingAmountPaise);
      changed.push(reconcileKey({ userId,key:'XP-006:FIRST_TRANSACTION',ruleId:'XP-006:FIRST_TRANSACTION',periodType:'once',periodKey:'FIRST_TRANSACTION',desired:firstTransaction,reasonCode:firstTransaction?'FIRST_TRANSACTION':'RECORD_REMOVED' }));
      const firstReview=facts.hasAnyReview(userId);
      changed.push(reconcileKey({ userId,key:'XP-006:FIRST_REVIEW',ruleId:'XP-006:FIRST_REVIEW',periodType:'once',periodKey:'FIRST_REVIEW',desired:firstReview,reasonCode:firstReview?'FIRST_REVIEW':'RECORD_REMOVED' }));
      const firstBudget=facts.hasAnyBudget(userId);
      changed.push(reconcileKey({ userId,key:'XP-006:FIRST_BUDGET',ruleId:'XP-006:FIRST_BUDGET',periodType:'once',periodKey:'FIRST_BUDGET',desired:firstBudget,reasonCode:firstBudget?'FIRST_BUDGET':'RECORD_REMOVED' }));
    })();
    return changed.filter(Boolean);
  }

  function releaseSweep(userId, { force = false } = {}) {
    if (!enabled) return { expired: 0, reconciled: 0 };
    const timestamp = nowIso();
    const expired = integrity.expiredHolds(userId,timestamp);
    for (const hold of expired) {
      if (integrity.expireHold(hold.id,timestamp)) integrity.recordReleaseAction(hold.caseId,hold.id,timestamp);
    }
    if (expired.length === 0 && !force) return { expired: 0, reconciled: 0 };
    const today = localDate(userId,clock.now());
    const from = shiftDate(today,-config.settlement.sealAfterDays);
    const reconciled = reconcileRange(userId,from,today);
    const releasedBadges = badges.releaseDeferred(userId);
    const releasedMissions = missions.releaseDeferred(userId);
    const advancedChallenges = challenges.advance(userId, closeThrough(userId), (id, now) => integrity.hasActiveHoldForScope(id, 'OUTCOME_XP', now));
    const advancedMissions = missions.advance(userId, closeThrough(userId), (id, now) => integrity.hasActiveHoldForScope(id, 'OUTCOME_XP', now));
    return { expired: expired.length, reconciled: reconciled.length + releasedBadges.length + releasedMissions.length + advancedChallenges.length + advancedMissions.length };
  }

  function runIntegrityAudit(userId, { persist = false } = {}) {
    if(!enabled)return {disabled:true,checks:{},failures:0};
    if(userId===null||userId===undefined)return integrity.auditUsers().map((id)=>runIntegrityAudit(id,{persist}));
    const startedAt=nowIso();
    const snapshot=integrity.auditSnapshot(userId,startedAt);
    if(!snapshot)return {userId,checks:{userExists:false},failures:1};
    const theoreticalMaxXp=theoreticalMaximum(snapshot,config);
    const ceiling=checkTheoreticalCeiling({lifetimeXp:snapshot.lifetimeXp,positiveAdjustmentXp:snapshot.positiveAdjustmentXp,
      theoreticalMaxXp},config.integrity.ceiling.toleranceXp);
    const checks={ledgerLifetimeMatchesCache:snapshot.lifetimeXp===snapshot.ledgerLifetimeXp,
      ledgerSpendableMatchesCache:snapshot.spendableXp===snapshot.ledgerSpendableXp,noDuplicateAwards:snapshot.duplicateAwards===0,
      noExpiredActiveHolds:snapshot.expiredHolds===0,nonNegativeFreezeInventory:snapshot.freezeBalance>=0,
      belowTheoreticalXpCeiling:!config.integrity.ceiling.enabled||!ceiling.exceeded};
    const failures=Object.values(checks).filter((passed)=>!passed).length;
    if(!checks.belowTheoreticalXpCeiling){
      try{logger.error?.('Gamification lifetime XP exceeds the configured theoretical ceiling.',{userId,earnedXp:ceiling.earnedXp,maximumXp:ceiling.maximumXp});}catch{/* logger failures are ignored */}
      if(persist){const timestamp=nowIso();db.transaction(()=>ledger.raiseFlag(userId,'XP_EXCEEDS_THEORETICAL_MAX',localDate(userId),
        {earnedXp:ceiling.earnedXp,maximumXp:ceiling.maximumXp},timestamp))();}
    }
    const result={userId,checks,failures,theoreticalMaxXp,earnedXp:ceiling.earnedXp,maximumXp:ceiling.maximumXp};
    if(persist)integrity.insertAuditRun({startedAt,finishedAt:nowIso(),checks:result,failures});
    return result;
  }

  function adjust({userId,delta,reason,actor,allowDemotion=false,caseId=null,reasonCode='ADMIN_ADJUSTMENT'}){
    if(!Number.isSafeInteger(delta)||delta===config.units.zero||!reason?.trim())throw httpError(400,'INVALID_ADJUSTMENT','Provide a non-zero whole XP delta and a reason.');
    if(!actor?.trim()||reason.trim().length<10)throw httpError(400,'ADMIN_REASON_REQUIRED','An admin actor and a note of at least 10 characters are required.');
    const requiresCase=delta<config.units.zero||reasonCode.startsWith('INTEGRITY_');
    if(requiresCase&&(!caseId||!actor?.trim()||reason.trim().length<10))throw httpError(400,'ADMIN_REASON_REQUIRED','Negative or integrity XP changes require a case, actor, and note of at least 10 characters.');
    const result=db.transaction(()=>{
      const progress=ensureProgress(userId);if(!progress)throw httpError(404,'USER_NOT_FOUND','User not found.');
      const reviewCase=requiresCase?integrity.caseById(caseId):null;
      if(requiresCase&&(!reviewCase||reviewCase.userId!==userId||reviewCase.status!=='IN_REVIEW'))throw httpError(409,'CASE_NOT_IN_REVIEW','An owned case in review is required for this adjustment.');
      if(BigInt(progress.lifetimeXp)+BigInt(delta)<BigInt(config.units.zero))throw httpError(422,'XP_BELOW_ZERO','Adjustment cannot make lifetime XP negative.');
      const newLifetime=safeTotal(BigInt(progress.lifetimeXp)+BigInt(delta));const newSpendable=safeTotal(BigInt(progress.spendableXp)+BigInt(delta));const derived=derivedLevel(newLifetime,config);
      const maxLevel=allowDemotion?derived:Math.max(progress.maxLevelReached,derived);const now=nowIso();
      const id=ledger.insert({userId,entryType:'ADJUSTMENT',ruleId:null,entitlementKey:null,transitionNo:null,idempotencyKey:`u${userId}:ADJ:${cryptoRandom()}`,
        lifetimeDelta:delta,balanceDelta:delta,periodType:'admin',periodKey:localDate(userId),reversesEntryId:null,sourceEventId:null,reasonCode,note:reason.trim(),configVersion:CONFIG_VERSION,actor,createdAt:now});
      ledger.updateProgress(userId,{lifetimeXp:newLifetime,spendableXp:newSpendable,maxLevelReached:maxLevel,lastLedgerId:id,updatedAt:now});
      integrity.insertNotice({userId,kind:'XP_CHANGE',code:'INTEGRITY_ADJUSTED',data:{delta,ledgerEntryId:id},ledgerEntryId:id,dedupeKey:`ADJUSTMENT:${id}:NOTICE`,createdAt:now});
      if(requiresCase){
        const action=delta<config.units.zero?'CLAWBACK':'NOTE';
        integrity.insertAdminAction({caseId,action,actor:`admin:${actor.trim()}`,note:reason.trim(),payload:{adjustmentId:id,delta,reasonCode},idempotencyKey:`CASE${caseId}:ADJUSTMENT:${id}`,createdAt:now});
      }
      return ledger.progress(userId);
    })();
    runIntegrityAudit(userId,{persist:true});
    return result;
  }

  function clawback({userId,caseId,entryIds,actor,note}) {
    if(!Array.isArray(entryIds)||entryIds.length===0||!entryIds.every(Number.isSafeInteger))throw httpError(400,'INVALID_CLAWBACK_ENTRIES','Select one or more ledger entry ids.');
    if(!actor?.trim()||!note?.trim()||note.trim().length<10)throw httpError(400,'ADMIN_REASON_REQUIRED','An admin actor and a note of at least 10 characters are required.');
    const result=db.transaction(()=>{
      const reviewCase=integrity.caseById(caseId);
      if(!reviewCase||reviewCase.userId!==userId)throw httpError(404,'INTEGRITY_CASE_NOT_FOUND','Integrity case not found.');
      if(reviewCase.status!=='IN_REVIEW')throw httpError(409,'CASE_NOT_IN_REVIEW','Only cases in review can be resolved.');
      const candidates=ledger.clawbackCandidates(userId,[...new Set(entryIds)]);
      let remaining=config.integrity.clawback.maxPerCaseXp;let lifetime=ledger.progress(userId)?.lifetimeXp??config.units.zero;
      const planned=[];
      for(const entry of candidates){
        if(remaining<=config.units.zero||lifetime<=config.units.zero)break;
        const delta=Math.min(entry.lifetimeDelta,remaining,lifetime);
        if(delta>config.units.zero){planned.push({entry,delta});remaining-=delta;lifetime-=delta;}
      }
      const totalXp=planned.reduce((sum,row)=>sum+row.delta,config.units.zero);
      if(totalXp===config.units.zero)return {applied:false,removedXp:config.units.zero,entryIds:[]};
      const now=nowIso();
      const sequence=integrity.caseActionCount(caseId,'CLAWBACK')+1;
      const recorded=integrity.insertAdminAction({caseId,action:'CLAWBACK',actor:`admin:${actor.trim()}`,note:note.trim(),
        payload:{entryIds:planned.map(({entry})=>entry.id),removedXp:totalXp},idempotencyKey:`CASE${caseId}:CLAWBACK:${sequence}`,createdAt:now});
      if(!recorded)return {applied:false,removedXp:config.units.zero,entryIds:[]};
      const progress=ledger.progress(userId);let lifetimeXp=progress.lifetimeXp;let spendableXp=progress.spendableXp;let lastLedgerId=progress.lastLedgerId;
      for(const {entry,delta} of planned){
        const id=ledger.insert({userId,entryType:'ADJUSTMENT',ruleId:null,entitlementKey:null,transitionNo:null,
          idempotencyKey:`u${userId}:ADJ:CASE${caseId}:${entry.id}`,lifetimeDelta:-delta,balanceDelta:-delta,periodType:'admin',periodKey:localDate(userId),
          reversesEntryId:entry.id,sourceEventId:null,reasonCode:'INTEGRITY_CLAWBACK',note:note.trim(),configVersion:CONFIG_VERSION,actor:`admin:${actor.trim()}`,createdAt:now});
        ledger.lockEntitlement(userId,entry.entitlementKey,'CLAWBACK',now,caseId);
        lifetimeXp=safeTotal(BigInt(lifetimeXp)-BigInt(delta));spendableXp=safeTotal(BigInt(spendableXp)-BigInt(delta));lastLedgerId=id;
        publish('XP_DEDUCTED',userId,{ledgerId:id,ruleId:null,entitlementKey:entry.entitlementKey,delta:-delta,reasonCode:'INTEGRITY_CLAWBACK',message:messageForReason('INTEGRITY_CLAWBACK'),lifetimeXp,spendableXp},`XP_DEDUCTED:${userId}:${id}`);
      }
      ledger.updateProgress(userId,{lifetimeXp,spendableXp,maxLevelReached:progress.maxLevelReached,lastLedgerId,updatedAt:now});
      integrity.setCaseResolution({caseId,resolution:'CLAWBACK',actor:actor.trim(),at:now});
      integrity.confirmCaseHolds(caseId,now);
      integrity.insertNotice({userId,kind:'XP_CHANGE',code:'CLAWBACK_APPLIED',data:{totalXp,dates:planned.map(({entry})=>entry.periodKey)},dedupeKey:`CASE${caseId}:CLAWBACK_NOTICE`,createdAt:now});
      return {applied:true,removedXp:totalXp,entryIds:planned.map(({entry})=>entry.id)};
    })();
    if(result.applied)runIntegrityAudit(userId,{persist:true});
    return result;
  }

  function requeueDead(userId=null){return outbox.requeueDead(userId);}
  function listFlags(userId){return ledger.listFlags(userId);}

  function clientRules() {
    const safeRules = Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'integrity'));
    return { configVersion: CONFIG_VERSION, ...safeRules };
  }

  return {enabled,clock,enqueue,processUser,settleUser,closedThrough:closeThrough,publishStreak,awardStreakMilestone,summary,ledgerPage,dailyReviewStatus,createReview,acknowledgeFeed,
    publicRules:clientRules,rebuildCache,reconcileRange,releaseSweep,runIntegrityAudit,adjust,clawback,requeueDead,listFlags,localDate,recordIntegritySignal,
    advanceRewards:(userId)=>{ const hold=(id,now)=>integrity.hasActiveHoldForScope(id,'OUTCOME_XP',now); const challengeResults=challenges.advance(userId,closeThrough(userId),hold); const missionResults=missions.advance(userId,closeThrough(userId),hold); missions.current(userId); return [...challengeResults,...missionResults,...missions.releaseDeferred(userId),...badges.releaseDeferred(userId),...badges.evaluate(userId)]; },
    badgeCatalog:(userId)=>badges.catalog(userId), evaluateBadges:(userId,slug=null,options={})=>badges.evaluate(userId,config.rewards.badges.filter((family)=>!slug||family.slug===slug),options),
    reconcileBadge:({userId,slug,tier,desired,reasonCode,note})=>reconcileKey({userId,key:`BAD-003:${slug}:${tier}`,ruleId:'BAD-003',periodType:'once',periodKey:`BAD-003:${slug}:${tier}`,desired,value:rewards.badge(userId,slug,tier)?.xpAwarded??0,reasonCode,note}),
    lockBadge:(userId,slug,tier,at,caseId)=>ledger.lockEntitlement(userId,`BAD-003:${slug}:${tier}`,'ADMIN',at,caseId),
    unlockBadge:(userId,slug,tier)=>ledger.unlockAdminEntitlement(userId,`BAD-003:${slug}:${tier}`),
    missionCurrent:(userId)=>missions.current(userId), missionHistory:(userId,filters)=>missions.history(userId,filters), rerollMission:(userId,slot)=>missions.reroll(userId,slot),
    rewardConfig:()=>config.rewards, rewardUnits:()=>config.units, purchaseState:(userId)=>{const state=ensureProgress(userId);return {level:state?.maxLevelReached??0,spendableXp:state?.spendableXp??0,lifetimeXp:state?.lifetimeXp??0};},
    recordSpend, recordSpendRefund, recordChallengeReward, emitRewardEvent:(type,userId,data,key)=>publish(type,userId,data,key),
    challengeCatalog:(userId)=>challenges.catalog(userId), startChallenge:(userId,slug,key)=>challenges.start(userId,slug,key),
    cancelChallenge:(userId,id)=>challenges.cancel(userId,id), abandonChallenge:(userId,id)=>challenges.abandon(userId,id),
    challengeRun:(userId,id)=>challenges.run(userId,id),
    dependencies:{db,outbox,ledger,facts,settlements,transactions,budgetHistory,rewards,missions:missionRepository}};
}

function cryptoRandom(){return randomUUID();}

