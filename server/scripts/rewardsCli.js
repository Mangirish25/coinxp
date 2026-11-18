import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/db/connection.js';
import { migrateDatabase } from '../src/db/migrator.js';
import { createGamificationEngine } from '../src/gamification/engine.js';
import { createBadgeAdminService } from '../src/services/badgeAdminService.js';

const [area,command,...args]=process.argv.slice(2);
const option=(name)=>{const index=args.indexOf(`--${name}`);return index<0?null:args[index+1]??null;};
const apply=args.includes('--apply');
const userOption=option('user'); const userId=userOption?Number(userOption):null; const slug=option('slug');
const env=loadEnv();const db=createDatabase(env.dbPath);const print=(value)=>console.log(JSON.stringify(value,null,2));
try {
  migrateDatabase(db);
  const engine=createGamificationEngine({db,enabled:env.gamificationEnabled});
  const admin=createBadgeAdminService({db,gameEngine:engine});
  if(area==='badges'&&command==='backfill'){
    if(userOption&&(!Number.isSafeInteger(userId)||userId<1))throw new Error('--user must be a positive integer.');
    if(slug&&!engine.rewardConfig().badges.some((family)=>family.slug===slug))throw new Error(`Unknown badge slug: ${slug}`);
    if(userId&&!db.prepare('SELECT 1 FROM users WHERE id=?').get(userId))throw new Error('User not found.');
    const users=userId?[{id:userId}]:db.prepare('SELECT id FROM users ORDER BY id').all();
    if(!apply){
      const projected=users.map(({id})=>({userId:id,eligibleFamilies:engine.badgeCatalog(id).data
        .filter((family)=>(!slug||family.slug===slug)&&family.tiers.some((tier)=>tier.status==='LOCKED'&&family.metricValue>=tier.threshold))
        .map(({slug:badgeSlug})=>badgeSlug)}));
      print({dryRun:true,command:'badges:backfill',userCount:users.length,userId,slug,awardXp:engine.rewardConfig().backfill.awardXp,silent:engine.rewardConfig().backfill.silent,projected});
    }
    else {
      const results=[];
      for(const user of users)results.push({userId:user.id,unlocked:engine.evaluateBadges(user.id,slug,{awardXp:engine.rewardConfig().backfill.awardXp,summaryNotice:engine.rewardConfig().backfill.silent})});
      print({applied:true,results});
    }
  } else if(area==='badges'&&command==='revoke'){
    const input={userId:Number(option('user')),slug,tier:Number(option('tier')),caseId:Number(option('case')),actor:option('actor'),note:option('note')};
    if(!Number.isSafeInteger(input.userId)||input.userId<1||!Number.isSafeInteger(input.tier)||input.tier<1||!Number.isSafeInteger(input.caseId)||input.caseId<1||!input.slug)
      throw new Error('Usage: badges revoke --user <id> --slug <slug> --tier <n> --case <id> --actor <name> --note <text> [--apply]');
    if(!input.actor||!input.note||input.note.trim().length<10)throw new Error('Revocation requires --actor and a note of at least 10 characters.');
    print(admin.revoke(input,{apply}));
  } else throw new Error('Usage: rewardsCli.js badges <backfill|revoke> ... [--apply]');
} finally { db.close(); }
