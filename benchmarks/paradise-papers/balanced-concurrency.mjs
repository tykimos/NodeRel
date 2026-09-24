// Confirm throughput with the exact same finite workload, avoiding a different
// case mix when a fast engine completes more of a timed request sequence.
import neo4j from 'neo4j-driver';
import {readFileSync,writeFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {BOLT,runNeo4j,stats} from './common.mjs';
const out=new URL('./results.json',import.meta.url);
const result=JSON.parse(readFileSync(out,'utf8'));
if(!result.completed)throw new Error('Finish the main benchmark before this independent follow-up.');
if(result.balancedConcurrency)throw new Error('Balanced results already exist; preserve them before an intentional repeat.');
const cases=result.sampling.cases;
const totalRequests=cases.length*2;
result.balancedConcurrency=[];
result.balancedConcurrencyMethodology={startedAt:new Date().toISOString(),requestsPerCondition:totalRequests,description:'Same 36 requests per engine and condition: two complete cycles of all 18 cases, with 12 requests per source-degree stratum. Closed-loop scheduling until the fixed batch is exhausted. Two rounds reverse engine order at 1, 8, 16 clients. Startup and warmup excluded; drain and SQLite worker messaging included. This is finite-batch throughput, not steady-state service capacity. The earlier time-window results remain under concurrency and can have different case mixes.'};
const driver=neo4j.driver(BOLT,neo4j.auth.none(),{disableLosslessIntegers:true,maxConnectionPoolSize:20});
const save=()=>writeFileSync(out,JSON.stringify(result,null,2)+'\n');
function check(value,index){assert.deepEqual(value,cases[index].expected.reach6);result.verification.aggregateChecks++;}
function send(worker,message){return new Promise((resolve,reject)=>{
 const error=e=>{worker.off('message',receive);reject(e);};
 const receive=r=>{worker.off('error',error);r.error?reject(new Error(r.error)):resolve(r);};
 worker.once('error',error);worker.once('message',receive);worker.postMessage(message);
});}
try{
 for(const clients of [1,8,16])for(let round=0;round<2;round++)for(const impl of round?['noderel-bfs','neo4j-bolt']:['neo4j-bolt','noderel-bfs']){
  console.log('BALANCED',clients,round,impl);
  const workers=[],sessions=[];
  try{
   if(impl==='noderel-bfs')for(let i=0;i<clients;i++){
    const worker=new Worker(new URL('./worker.mjs',import.meta.url));workers.push(worker);
    await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});
   }else for(let i=0;i<clients;i++)sessions.push(driver.session({database:'neo4j',defaultAccessMode:neo4j.session.READ}));
   const request=(client,index)=>impl==='neo4j-bolt'?runNeo4j(sessions[client],'reach6',cases[index]):send(workers[client],{workload:'reach6',p:cases[index],algorithm:'bfs'});
   await Promise.all(Array.from({length:clients},async(_,c)=>{for(let j=0;j<2;j++){const index=(c+j*6)%cases.length;check((await request(c,index)).value,index);}}));
   let next=0;const raw=[],start=performance.now();
   await Promise.all(Array.from({length:clients},async(_,client)=>{
    for(;;){const job=next++;if(job>=totalRequests)return;const index=job%cases.length,t=performance.now();const value=await request(client,index),ms=performance.now()-t;check(value.value,index);raw.push({job,caseIndex:index,ms,executionMs:value.executionMs});}
   }));
   const elapsedMs=performance.now()-start;
   assert.equal(raw.length,totalRequests);
   for(let i=0;i<cases.length;i++)assert.equal(raw.filter(x=>x.caseIndex===i).length,2);
   const row={implementation:impl,clients,round,elapsedMs,requestsPerSecond:raw.length*1000/elapsedMs,...stats(raw.map(x=>x.ms)),raw};
   result.balancedConcurrency.push(row);save();console.log('RESULT',JSON.stringify({...row,raw:undefined}));
  }finally{await Promise.all(workers.map(w=>w.terminate()));await Promise.all(sessions.map(s=>s.close()));}
 }
 result.balancedConcurrencyMethodology.finishedAt=new Date().toISOString();result.balancedConcurrencyMethodology.completed=true;save();
}finally{await driver.close();}
