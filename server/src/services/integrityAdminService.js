import rules from '../gamification/rules.config.js';
import { createIntegrityRepository } from '../repositories/integrityRepository.js';
import { responseLadder } from '../gamification/integrity/risk.js';

const ACTIONS = Object.freeze({ DISMISS:'DISMISS', WARN:'WARN', HOLD_EXTENDED:'EXTEND_HOLD', RESTRICTED:'EXTEND_HOLD', EXTEND_HOLD:'EXTEND_HOLD', RELEASE_HOLD:'RELEASE_HOLD', CLAWBACK:'CLAWBACK', NOTE:'NOTE' });

export function createIntegrityAdminService({ db, engine, clock = { now: () => new Date() } }) {
  const repository=createIntegrityRepository(db);
  const now=()=>clock.now().toISOString();
  function listCases(options) { return repository.listCases(options); }
  function showCase(caseId) {
    const item=repository.caseById(caseId);
    return item ? {...item,flags:repository.flags({caseId}),actions:repository.caseActions(caseId)} : null;
  }
  function listFlags(filters) { return repository.flags(filters); }
  function score(userId) {
    const flags=repository.flags({userId});
    const createdAt=repository.userCreatedAt(userId);
    if(!createdAt)throw new Error('User not found.');
    const now=clock.now();
    const since=new Date(now.getTime()-rules.integrity.holds.rollingWindowDays*rules.units.hoursPerDay*rules.units.minutesPerHour*rules.units.secondsPerMinute*rules.units.millisecondsPerSecond).toISOString();
    return responseLadder({flags,accountCreatedAt:createdAt,now,autoHoldsLast90Days:repository.autoHoldCountSince(userId,since)},rules);
  }
  function applyCaseAction(input) {
    const {caseId,action,actor,note,days=rules.integrity.holds.autoDurationDays}=input;
    if (!Number.isSafeInteger(caseId) || caseId < 1) throw new TypeError('caseId must be a positive integer.');
    if (!actor?.trim()) throw new TypeError('An admin actor is required.');
    if (!note?.trim() || note.trim().length < 10) throw new TypeError('An admin note must contain at least 10 characters.');
    const actionType=ACTIONS[action];
    if (!actionType) throw new TypeError('Unsupported case action.');
    const timestamp=now();
    const caseRow=repository.caseById(caseId);
    if (!caseRow) throw new Error('Integrity case not found.');
    const resolution = action==='DISMISS'?'DISMISSED':action==='WARN'?'WARNED':action==='HOLD_EXTENDED'?'HOLD_EXTENDED':action==='RESTRICTED'?'RESTRICTED':action==='CLAWBACK'?'CLAWBACK':null;
    if (caseRow.status==='RESOLVED' && resolution && caseRow.resolution===resolution) return {applied:false,caseId,action};
    if (['DISMISS','WARN','HOLD_EXTENDED','RESTRICTED','CLAWBACK'].includes(action) && caseRow.status!=='IN_REVIEW') throw new Error('Only cases in review can be resolved.');
    if(action==='CLAWBACK')return engine.clawback({userId:caseRow.userId,caseId,entryIds:input.entryIds,actor,note});
    if (actionType==='EXTEND_HOLD' && (!Number.isSafeInteger(days)||days<1)) throw new TypeError('Hold duration must be a positive whole number of days.');
    const shouldRelease=action==='DISMISS'||action==='WARN'||action==='RELEASE_HOLD';
    const sequence=repository.caseActionCount(caseId,actionType)+1;
    const result=db.transaction(()=>{
      const applied=repository.insertAdminAction({caseId,action:actionType,actor:`admin:${actor.trim()}`,note:note.trim(),
        payload:{requestedAction:action,days:actionType==='EXTEND_HOLD'?days:null},idempotencyKey:`CASE${caseId}:${actionType}:${sequence}`,createdAt:timestamp});
      if(!applied)return {applied:false,caseId,action};
      if(action==='DISMISS'||action==='WARN'){
        repository.setCaseFlagsStatus(caseId,action==='DISMISS'?'DISMISSED':'CONFIRMED');
        repository.setCaseResolution({caseId,resolution:action==='DISMISS'?'DISMISSED':'WARNED',actor:actor.trim(),at:timestamp});
      } else if(action==='HOLD_EXTENDED'||action==='RESTRICTED') {
        const hold=repository.activeHoldsForCase(caseId)[0];
        if(!hold)throw new Error('There is no active hold to extend.');
        const maxEnd=new Date(new Date(hold.startsAt).getTime()+rules.integrity.holds.maxTotalDays*rules.units.hoursPerDay*rules.units.minutesPerHour*rules.units.secondsPerMinute*rules.units.millisecondsPerSecond);
        const requestedEnd=new Date(clock.now().getTime()+days*rules.units.hoursPerDay*rules.units.minutesPerHour*rules.units.secondsPerMinute*rules.units.millisecondsPerSecond);
        const endsAt=new Date(Math.min(maxEnd.getTime(),requestedEnd.getTime())).toISOString();
        if(endsAt<=timestamp)throw new Error('The maximum hold duration has already elapsed.');
        if(endsAt<=hold.endsAt)throw new Error('The requested end time does not extend the current hold.');
        repository.extendCaseHold(caseId,endsAt);
        if(action==='HOLD_EXTENDED'||action==='RESTRICTED')repository.setCaseResolution({caseId,resolution:action,actor:actor.trim(),at:timestamp});
      }
      if(shouldRelease){
        repository.releaseCaseHolds(caseId,timestamp);
        repository.insertNotice({userId:caseRow.userId,kind:'REVIEW',code:action==='WARN'?'CASE_RESOLVED_WARNING':'HOLD_RELEASED',data:{caseId},dedupeKey:`CASE${caseId}:${actionType}:NOTICE`,createdAt:timestamp});
      } else if(action!=='NOTE') {
        repository.insertNotice({userId:caseRow.userId,kind:'REVIEW',code:'CASE_UPDATED',data:{caseId},dedupeKey:`CASE${caseId}:${actionType}:NOTICE`,createdAt:timestamp});
      }
      return {applied:true,caseId,action};
    })();
    if(shouldRelease&&result.applied)engine?.releaseSweep?.(caseRow.userId,{force:true});
    return result;
  }
  function dismissFlag({ flagId, actor, note }) {
    if (!Number.isSafeInteger(flagId)||flagId<1)throw new TypeError('flagId must be a positive integer.');
    if (!actor?.trim()||!note?.trim()||note.trim().length<10)throw new TypeError('An admin actor and a note of at least 10 characters are required.');
    const flag=repository.flags({}).find((row)=>row.id===flagId);
    if(!flag)throw new Error('Integrity flag not found.');
    if(!flag.caseId)throw new Error('This flag is not attached to a review case.');
    const timestamp=now();
    return db.transaction(()=>{
      const key=`FLAG${flagId}:DISMISS`;
      const inserted=repository.insertAdminAction({caseId:flag.caseId,action:'DISMISS',actor:`admin:${actor.trim()}`,note:note.trim(),payload:{flagId},idempotencyKey:key,createdAt:timestamp});
      if(!inserted)return {applied:false,flagId};
      repository.setFlagStatus(flagId,'DISMISSED');
      repository.insertNotice({userId:flag.userId,kind:'REVIEW',code:'CASE_UPDATED',data:{caseId:flag.caseId},dedupeKey:key,createdAt:timestamp});
      return {applied:true,flagId};
    })();
  }
  return {listCases,showCase,listFlags,score,applyCaseAction,dismissFlag};
}
