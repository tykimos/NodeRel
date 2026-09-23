import neo4j from 'neo4j-driver';
import { writeFileSync,readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { cpus,release,totalmem } from 'node:os';
import assert from 'node:assert/strict';
import { N,DEGREE,SEED,SqlReader,parameters,CYPHER,dataset,oracle,stats } from './common.mjs';
const file=fileURLToPath(new URL('./bench.sqlite',import.meta.url));
const outFile=new URL('./results.json',import.meta.url),cases=parameters(24),g=dataset();
const driver=neo4j.driver('bolt://127.0.0.1:17687',neo4j.auth.none(),{disableLosslessIntegers:true,maxConnectionPoolSize:16,connectionAcquisitionTimeout:30000});
const session=driver.session({database:'neo4j',defaultAccessMode:neo4j.session.READ}),sql=new SqlReader(file);
const result={generatedAt:new Date().toISOString(),environment:{node:process.version,sqlite:sql.db.prepare('SELECT sqlite_version() v').get().v,neo4j:'2025.06.2 Community',driver:'5.28.3',cpu:cpus()[0].model,logicalCpus:cpus().length,memoryBytes:totalmem(),os:release(),neoHeapMiB:1024,neoPageCacheMiB:1024,sqliteCacheMiBPerConnection:64},dataset:{nodes:N,edges:N*DEGREE,seed:SEED,description:'Directed graph, ring plus five distinct pseudorandom outgoing edges per node; 10% inactive nodes; no parallel edges or self loops.'},cases,single:[],profiles:{},concurrency:[],verification:{checks:0,fullReachSets:[]}};
function save(){writeFileSync(outFile,JSON.stringify(result,null,2));}
function expected(workload,p){
 if(workload==='floor')return {value:1};if(workload==='point')return {value:p.source};
 if(workload==='shortest'||workload==='filtered')return {distance:oracle(g,p.source,10,p.target,workload==='filtered')};
 return oracle(g,p.source,Number(workload.slice(5)));
}
const expectations=Object.fromEntries(Object.keys(CYPHER).map(w=>[w,cases.map(p=>expected(w,p))]));
async function neoRun(s,w,p){const r=await s.run(CYPHER[w],p,{timeout:60000});return {value:r.records[0]?.toObject()||{distance:null},serverAvailableMs:r.summary.resultAvailableAfter,serverConsumedMs:r.summary.resultConsumedAfter};}
function check(actual,w,index){assert.deepEqual({...actual},expectations[w][index%cases.length]);result.verification.checks++;}
function flatten(p){return {operator:p.operatorType,rows:p.rows,dbHits:p.dbHits,details:p.arguments?.Details,children:(p.children||[]).map(flatten)};}
async function fullReachVerification(){
 for(const caseIndex of [0,7,15]){
  const source=cases[caseIndex].source;
  const a=await session.run('MATCH p=(s:Bench {id:$source})-[:LINK*1..6]->(n) WITH s,n,min(length(p)) AS depth WHERE n<>s RETURN n.id AS id,depth ORDER BY id',{source});
  const rows=sql.db.prepare(`WITH RECURSIVE w(id,depth) AS (SELECT ?,0 UNION SELECT l.to_id,w.depth+1 FROM w JOIN links l ON l.from_id=w.id WHERE w.depth<6) SELECT id,min(depth) AS depth FROM w WHERE id<>? GROUP BY id ORDER BY id`).all(source,source).map(x=>({...x}));
  assert.deepEqual(a.records.map(r=>r.toObject()),rows);result.verification.fullReachSets.push({source,nodes:rows.length,equal:true});
 }
}
try{
 await driver.verifyConnectivity();
 console.log('Validating full reached node/depth sets');await fullReachVerification();save();
 for(const w of ['floor','point','shortest','filtered','reach3','reach6']){
  console.log('START',w);
  // Warm every implementation and rotate measured order to reduce order effects.
  for(let i=0;i<40;i++)await neoRun(session,w,cases[i%24]);
  for(let i=0;i<8;i++)sql.run(w,cases[i%24],'optimized');
  const impls=['neo4j-bolt','sqlite-optimized'];
  if(!['floor','point'].includes(w)){impls.push('sqlite-cte');for(let i=0;i<2;i++)sql.run(w,cases[i],'cte');}
  const count=['floor','point'].includes(w)?120:['shortest','filtered'].includes(w)?12:24,raw=Object.fromEntries(impls.map(k=>[k,[]]));
  for(let i=0;i<count;i++)for(let k=0;k<impls.length;k++){
   const impl=impls[(i+k)%impls.length];if(impl==='sqlite-cte'&&['shortest','filtered'].includes(w)&&i>=12)continue;
   const p=cases[i%24],start=performance.now();
   const r=impl==='neo4j-bolt'?await neoRun(session,w,p):{value:sql.run(w,p,impl==='sqlite-cte'?'cte':'optimized')};
   const ms=performance.now()-start;check(r.value,w,i);raw[impl].push({caseIndex:i%24,ms,...r});
  }
  for(const impl of impls){const row={workload:w,implementation:impl,...stats(raw[impl].map(x=>x.ms)),raw:raw[impl]};result.single.push(row);console.log(w,impl,JSON.stringify({...row,raw:undefined}));}
  result.profiles[w]=flatten((await session.run('PROFILE '+CYPHER[w],cases[0])).summary.profile);save();
 }
 // Concurrent closed-loop clients: no batch queue outside the measured per-request latency.
 // SQLite gets one reader connection per worker; native work is not blocked on one JS thread.
 for(const concurrency of [1,4,8])for(const impl of ['neo4j-bolt','sqlite-optimized']){
  const workload='reach6',workers=[],sessions=[];let seq=0;
  console.log('CONCURRENCY',concurrency,impl);
  if(impl==='sqlite-optimized'){
   for(let i=0;i<concurrency;i++){
    const worker=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:{file}});
    await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});workers.push(worker);
   }
  }else for(let i=0;i<concurrency;i++)sessions.push(driver.session({database:'neo4j',defaultAccessMode:neo4j.session.READ}));
  async function run(client,index){
   if(impl==='neo4j-bolt')return (await neoRun(sessions[client],workload,cases[index%24])).value;
   return new Promise((resolve,reject)=>{
    workers[client].once('message',r=>r.error?reject(new Error(r.error)):resolve(r.result));
    workers[client].postMessage({seq:seq++,workload,p:cases[index%24],implementation:'optimized'});
   });
  }
  try{
   await Promise.all(Array.from({length:concurrency},async(_,c)=>{for(let j=0;j<4;j++)check(await run(c,j),workload,j);}));
   const durationMs=6000,times=[];let next=0;const started=performance.now();
   await Promise.all(Array.from({length:concurrency},async(_,c)=>{for(;;){if(performance.now()-started>=durationMs)return;const i=next++;const t=performance.now();const value=await run(c,i);times.push(performance.now()-t);check(value,workload,i);}}));
   const n=times.length,elapsedMs=performance.now()-started,row={workload,implementation:impl,concurrency,n,elapsedMs,requestsPerSecond:n*1000/elapsedMs,...stats(times),rawMs:times};result.concurrency.push(row);console.log(JSON.stringify({...row,rawMs:undefined}));save();
  }finally{await Promise.all(workers.map(w=>w.terminate()));await Promise.all(sessions.map(s=>s.close()));}
 }
 result.completed=true;save();console.log('DONE checks',result.verification.checks);
}finally{sql.close();await session.close();await driver.close();}
