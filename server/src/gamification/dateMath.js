import rules from './rules.config.js';

const units=rules.units;
const part=(instant,timeZone,type)=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant).find((item)=>item.type===type)?.value;

export function localDateAt(instant, timezone) {
  const date=new Date(instant);
  return `${part(date,timezone,'year')}-${part(date,timezone,'month')}-${part(date,timezone,'day')}`;
}

export function shiftDate(date, days) {
  const [year,month,day]=date.split('-').map(Number);
  const shifted=new Date(Date.UTC(year,month-units.one,day+days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth()+units.one).padStart(units.two,'0')}-${String(shifted.getUTCDate()).padStart(units.two,'0')}`;
}

export function daysInMonth(month) {
  const [year,number]=month.split('-').map(Number);
  return new Date(Date.UTC(year,number,units.zero)).getUTCDate();
}

export function monthOf(date) { return date.slice(units.zero,units.monthLabelLength); }

export function weekKey(date) {
  const [year,month,day]=date.split('-').map(Number);
  const d=new Date(Date.UTC(year,month-units.one,day));
  const weekday=d.getUTCDay()||units.daysPerWeek;
  d.setUTCDate(d.getUTCDate()+units.isoThursdayOffset-weekday);
  const weekYear=d.getUTCFullYear();
  const jan4=new Date(Date.UTC(weekYear,units.zero,units.isoWeekAnchorDay));
  const jan4Day=jan4.getUTCDay()||units.daysPerWeek;
  jan4.setUTCDate(jan4.getUTCDate()+units.isoThursdayOffset-jan4Day);
  const week=Math.floor((d-jan4)/(units.hoursPerDay*units.minutesPerHour*units.secondsPerMinute*units.millisecondsPerSecond*units.daysPerWeek))+units.one;
  return `${weekYear}-W${String(week).padStart(units.two,'0')}`;
}

export function weekBounds(key) {
  const [year,week]=key.split('-W').map(Number);
  const jan4=new Date(Date.UTC(year,units.zero,units.isoWeekAnchorDay));
  const day=jan4.getUTCDay()||units.daysPerWeek;
  const monday=new Date(jan4); monday.setUTCDate(jan4.getUTCDate()-day+units.one+(week-units.one)*units.daysPerWeek);
  return { start:monday.toISOString().slice(units.zero,units.dateLength), end:shiftDate(monday.toISOString().slice(units.zero,units.dateLength),units.daysPerWeek-units.one) };
}

// Convert a wall-clock label to UTC by iteratively applying the observed zone offset.
export function localInstantToUtc(date, hour, timezone) {
  const [year,month,day]=date.split('-').map(Number);
  const desired=Date.UTC(year,month-units.one,day,hour);
  let guess=desired;
  for(let attempt=units.zero;attempt<units.wallClockSearchAttempts;attempt+=units.one){
    const current=new Date(guess);
    const local=Date.UTC(Number(part(current,timezone,'year')),Number(part(current,timezone,'month'))-units.one,Number(part(current,timezone,'day')),Number(part(current,timezone,'hour')),Number(part(current,timezone,'minute')),Number(part(current,timezone,'second')));
    const delta=desired-local;
    if(delta===units.zero)return new Date(guess).toISOString();
    guess+=delta;
  }
  return new Date(guess).toISOString();
}

export function weekDateRange(start, end) {
  const dates=[];
  for(let date=start;date<=end;date=shiftDate(date,units.one))dates.push(date);
  return dates;
}

export function monthStart(date) { return `${monthOf(date)}-01`; }
export function monthEnd(month) { return `${month}-${String(daysInMonth(month)).padStart(units.two,'0')}`; }
