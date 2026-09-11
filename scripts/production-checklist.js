const {spawnSync}=require('child_process');
const checks=[
 ['TypeScript',['run','typecheck']],
 ['ESLint',['run','lint']],
 ['Build',['run','build']],
];
let failed=0;
for(const [name,args] of checks){console.log(`\n=== ${name} ===`);const r=spawnSync('npm',['--silent',...args],{stdio:'inherit',shell:process.platform==='win32'});if(r.status!==0){failed++;console.error(`${name}: FAIL`) }else console.log(`${name}: PASS`)}
console.log('\n=== Database / seed / smoke ===');
const db=spawnSync(process.execPath,['scripts/production-smoke.js'],{stdio:'inherit'});if(db.status!==0)failed++;
if(!process.env.DATABASE_URL) console.log('DB-dependent tests require DATABASE_URL and are skipped by production-smoke.js.');
console.log(`\nProduction checklist result: ${failed?'FAIL':'PASS'}`);process.exit(failed?1:0);
