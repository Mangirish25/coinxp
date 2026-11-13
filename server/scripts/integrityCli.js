import { loadEnv } from '../src/config/env.js';
import rules from '../src/gamification/rules.config.js';
import { createGamificationEngine } from '../src/gamification/engine.js';
import { createIntegrityAdminService } from '../src/services/integrityAdminService.js';
import { createDatabase } from '../src/db/connection.js';
import { migrateDatabase } from '../src/db/migrator.js';

const [area, command, ...args] = process.argv.slice(2);
const apply=args.includes('--apply');
const option=(name)=>{const index=args.indexOf(`--${name}`);return index<0?null:args[index+1]??null;};
const env=loadEnv();const db=createDatabase(env.dbPath);
const print=(value)=>console.log(JSON.stringify(value,null,2));
try {
  migrateDatabase(db);
  const engine=createGamificationEngine({db,enabled:env.gamificationEnabled});
  const service=createIntegrityAdminService({db,engine,clock:engine.clock});
  if(area==='cases'&&command==='list'){
    const overdue=args.includes('--overdue');
    const cutoff=overdue?new Date(Date.now()-rules.integrity.review.targetResolutionDays*rules.units.hoursPerDay*rules.units.minutesPerHour*rules.units.secondsPerMinute*rules.units.millisecondsPerSecond).toISOString():null;
    print(service.listCases({status:option('status'),overdueBefore:cutoff}));
  } else if(area==='cases'&&command==='show'){
    const caseId=Number(args.find((value)=>/^\d+$/.test(value)));
    const result=service.showCase(caseId);if(!result)throw new Error('Integrity case not found.');print(result);
  } else if(area==='score'){
    const userId=Number(option('user'));if(!Number.isSafeInteger(userId)||userId<1)throw new Error('Usage: integrityCli.js score --user <id>');
    print(service.score(userId));
  } else if(area==='flags'&&command==='list'){
    print(service.listFlags({userId:option('user')?Number(option('user')):null,code:option('code')}));
  } else if(area==='cases'&&['resolve','note','extend-hold','release-hold'].includes(command)){
    const caseId=Number(args.find((value)=>/^\d+$/.test(value)));
    const action=command==='note'?'NOTE':command==='extend-hold'?'HOLD_EXTENDED':command==='release-hold'?'RELEASE_HOLD':option('action');
    const input={caseId,action,actor:option('actor'),note:option('note'),days:option('days')?Number(option('days')):undefined};
    if(!caseId||!action)throw new Error('Case id and --action are required.');
    print(apply?service.applyCaseAction(input):{dryRun:true,command, ...input});
  } else if(area==='flags'&&command==='dismiss'){
    const flagId=Number(args.find((value)=>/^\d+$/.test(value)));
    const input={flagId,actor:option('actor'),note:option('note')};
    print(apply?service.dismissFlag(input):{dryRun:true,command,...input});
  } else {
    throw new Error('Usage: integrityCli.js cases <list|show|resolve|note|extend-hold|release-hold> | flags <list|dismiss> | score --user <id> [--apply]');
  }
} finally { db.close(); }
