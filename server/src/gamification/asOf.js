import { localDateAt, monthEnd, monthStart, shiftDate, weekDateRange } from './dateMath.js';

export function effectiveBudgetFromHistory(history, scope, categoryId, month, instant) {
  const state=new Map();
  for(const row of history){
    if(row.createdAt>instant)continue;
    const key=`${row.scope}:${row.categoryId??''}:${row.month??''}`;
    if(row.action==='delete')state.delete(key);
    else state.set(key,{scope:row.scope,categoryId:row.categoryId??null,month:row.month??null,amountPaise:row.newAmountPaise,createdAt:row.createdAt});
  }
  const rows=[...state.values()].filter((row)=>row.scope===scope&&(row.categoryId??null)===(categoryId??null));
  const specific=rows.find((row)=>row.month===month);
  if(specific)return {...specific,source:'month'};
  const fallback=rows.find((row)=>row.month===null);
  return fallback?{...fallback,source:'default'}:null;
}

export function transactionFactsAsOf(auditRows, from, to, instant, minimumPaise) {
  const latest=new Map();
  for(const row of auditRows){
    if(row.createdAt>instant)continue;
    latest.set(row.transactionId,row);
  }
  const facts=[];
  for(const row of latest.values()){
    if(row.action==='delete'||!row.after)continue;
    const record=row.after;
    if(record.transactionDate<from||record.transactionDate>to)continue;
    const live=record.deletedAt==null&&record.createdLocalDate===record.transactionDate&&record.amountPaise>=minimumPaise;
    facts.push({transactionId:row.transactionId,type:record.type,amountPaise:record.amountPaise,transactionDate:record.transactionDate,live,isUnexpected:Boolean(record.isUnexpected)});
  }
  return facts;
}

export function summarizeAsOfFacts(facts, from, to, date) {
  let expenses=0; let liveCount=0; let expenseExists=false;
  for(const fact of facts){
    if(fact.type==='expense'){
      expenseExists=true;
      expenses+=fact.amountPaise;
    }
    if(fact.transactionDate===date&&fact.live)liveCount+=1;
  }
  return {expenses,liveCount,expenseExists,tracked:liveCount>0};
}

export function transactionFactsAsOfDate(auditRows, date, instant, minimumPaise) {
  return transactionFactsAsOf(auditRows,date,date,instant,minimumPaise);
}

export function budgetPeriodStart(date, timezone, localInstantToUtc) {
  return localInstantToUtc(date,0,timezone);
}

export function dayCutoff(date, timezone, config, localInstantToUtc) {
  return localInstantToUtc(shiftDate(date,1),config.settlement.cutoffLocalHour,timezone);
}

export function monthPeriodBounds(month) { return {from:monthStart(`${month}-01`),to:monthEnd(month)}; }
export function datesInPeriod(from,to) { return weekDateRange(from,to); }
export function dateMonth(date) { return localDateAt(new Date(`${date}T12:00:00.000Z`),'UTC').slice(0,7); }
