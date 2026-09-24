import neo4j from 'neo4j-driver';
import { readFileSync,writeFileSync,statSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus,totalmem,release } from 'node:os';
import { Worker } from 'node:worker_threads';
import assert from 'node:assert/strict';
import { BOLT,FILE,TYPES,openGraph,runNodeRel,runNeo4j,cypher,stats,referenceGraph,referenceDistances,expectedRows } from './common.mjs';

const out=new URL('./results.json',import.meta.url);
if(existsSync(out))throw new Error('Preserve or move results.json before running a new experiment.');
const sampling=JSON.parse(readFileSync(new URL('./cases.json',import.meta.url),'utf8'));
const {cases}=sampling;
const graph=openGraph();
const driver=neo4j.driver(BOLT,neo4j.auth.none(),{disableLosslessIntegers:true,maxConnectionPoolSize:20});
const session=driver.session({database:'neo4j',defaultAccessMode:neo4j.session.READ});
const result={startedAt:new Date().toISOString(),completed:false,
 environment:{node:process.version,sqlite:graph.db.prepare('SELECT sqlite_version() AS v').get().v,driver:'5.28.3',cpu:cpus()[0].model,logicalCpus:cpus().length,memoryBytes:totalmem(),os:release(),neoHeapMiB:1024,neoPageCacheMiB:1024,sqliteCacheMiBPerConnection:64,sqliteBytes:statSync(FILE).size},
 source:JSON.parse(readFileSync(new URL('./sources.json',import.meta.url),'utf8')),sampling,
 methodology:{single:'Client wall time: direct NodeRel API in process or local Bolt using a reused session. Two measured rounds over all 18 cases; implementation order rotates for every case and round. No response cache or adjacency preload in measured implementations.',warmups:{nodeRelPerWorkload:3,neo4jPerWorkload:18},concurrency:'Two 10-second closed-loop runs for each of 1, 8, 16 clients. Order reversed in the second run. One SQLite connection per worker or one Bolt session per client. Includes draining in-flight requests and worker message overhead; excludes worker/session startup.',semantics:'Undirected traversal over three specified types. Reachability excludes the source and returns count and summed minimum depth. Shortest distance is bounded at ten hops. Full-row checks/measurements are separate. All use the identical normalized topology. Preparation, import, oracle and PROFILE excluded from timings.'},
 single:[],fullRows:[],concurrency:[],profiles:{},verification:{aggregateChecks:0,fullSets:[],topology:null}};
const impls=['noderel-sql','noderel-bfs','neo4j-bolt'];
const save=()=>writeFileSync(out,JSON.stringify(result,null,2)+'\n');
function check(value,w,index){assert.deepEqual(value,cases[index].expected[w]);result.verification.aggregateChecks++;}
function flatten(p){return {operator:p.operatorType,rows:p.rows,dbHits:p.dbHits,pageCacheMisses:p.pageCacheMisses,details:p.arguments?.Details,allocatedMemory:p.arguments?.GlobalMemory,children:(p.children||[]).map(flatten)};}
async function run(impl,w,p){return impl==='neo4j-bolt'?runNeo4j(session,w,p):{value:runNodeRel(graph,w,p,impl==='noderel-bfs'?'bfs':'sql')};}
async function verifyTopology(){
 const {data,adjacency}=referenceGraph();
 const nodes=data.nodes.map(({id,kind,scope,title})=>({id,kind,scope,title})).sort((a,b)=>a.id<b.id?-1:1);
 const edges=data.edges.map(({from,to,type,scope})=>({from,to,type,scope})).sort((a,b)=>a.from<b.from?-1:a.from>b.from?1:a.to<b.to?-1:a.to>b.to?1:a.type<b.type?-1:a.type>b.type?1:0);
 const sqlNodes=graph.db.prepare('SELECT id,kind,scope,title FROM items ORDER BY id').all().map(r=>({...r}));
 const sqlEdges=graph.db.prepare('SELECT from_id AS "from",to_id AS "to",type,scope FROM links ORDER BY from_id,to_id,type').all().map(r=>({...r}));
 const neoNodes=(await session.run('MATCH (n:Paradise) RETURN n.id AS id,n.kind AS kind,n.scope AS scope,n.title AS title ORDER BY id')).records.map(r=>r.toObject());
 const neoEdges=(await session.run('MATCH (a:Paradise)-[r]->(b:Paradise) RETURN a.id AS from,b.id AS to,type(r) AS type,r.scope AS scope ORDER BY from,to,type')).records.map(r=>r.toObject());
 assert.deepEqual(sqlNodes,nodes);assert.deepEqual(neoNodes,nodes);assert.deepEqual(sqlEdges,edges);assert.deepEqual(neoEdges,edges);
 const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
 result.verification.topology={nodes:nodes.length,edges:edges.length,nodeHash:hash(nodes),edgeHash:hash(edges),allEqual:true};save();
 for(const index of [0,6,12]){
  const reference=expectedRows(data,referenceDistances(adjacency,cases[index].id),6);
  for(const impl of impls){const value=(await run(impl,'full6',cases[index])).value;assert.deepEqual(value,reference);}
  result.verification.fullSets.push({caseIndex:index,rows:reference.length,sha256:hash(reference),allEqual:true});save();
 }
}
function workerRequest(worker,message){return new Promise((resolve,reject)=>{
 const onError=error=>{worker.off('message',onMessage);reject(error);};
 const onMessage=value=>{worker.off('error',onError);value.error?reject(new Error(value.error)):resolve(value);};
 worker.once('error',onError);worker.once('message',onMessage);worker.postMessage(message);
});}
try{
 await driver.verifyConnectivity();
 result.environment.neo4j=(await session.run('CALL dbms.components() YIELD versions,edition RETURN versions,edition')).records[0].toObject();
 console.log('Verify complete topology and full results');await verifyTopology();
 if(global.gc)global.gc();
 for(const w of ['reach4','reach6','reach8','shortest']){
  console.log('WORKLOAD',w);
  for(const impl of impls){const n=impl==='neo4j-bolt'?18:3;for(let j=0;j<n;j++){const index=[0,6,12][j%3];check((await run(impl,w,cases[index])).value,w,index);}}
  const raw=Object.fromEntries(impls.map(i=>[i,[]]));
  for(let round=0;round<2;round++)for(let index=0;index<cases.length;index++){
   for(let k=0;k<impls.length;k++){
    const impl=impls[(index+round+k)%impls.length],start=performance.now();
    const value=await run(impl,w,cases[index]),ms=performance.now()-start;
    check(value.value,w,index);raw[impl].push({round,caseIndex:index,stratum:cases[index].stratum,ms,...value});
   }
   console.log(w,'round',round,'case',index);
  }
  for(const impl of impls){
   const row={workload:w,implementation:impl,...stats(raw[impl].map(x=>x.ms)),byStratum:Object.fromEntries(['low','medium','high'].map(s=>[s,stats(raw[impl].filter(x=>x.stratum===s).map(x=>x.ms))])),raw:raw[impl]};
   result.single.push(row);console.log('RESULT',JSON.stringify({...row,raw:undefined}));
  }
  result.profiles[w]=flatten((await session.run('PROFILE '+cypher(w),cases[12])).summary.profile);save();
 }
 // Full rows measure equal serialization/materialization work, separately from scalar queries.
 for(const index of [0,6,12])for(let round=0;round<2;round++)for(let k=0;k<impls.length;k++){
  const impl=impls[(index+round+k)%impls.length],start=performance.now();
  const {value}=await run(impl,'full6',cases[index]),ms=performance.now()-start;
  const reference=result.verification.fullSets.find(x=>x.caseIndex===index);
  assert.equal(createHash('sha256').update(JSON.stringify(value)).digest('hex'),reference.sha256);
  result.fullRows.push({implementation:impl,caseIndex:index,round,rows:value.length,ms});
 }
 save();
 for(const clients of [1,8,16])for(let round=0;round<2;round++)for(const impl of round?['noderel-bfs','neo4j-bolt']:['neo4j-bolt','noderel-bfs']){
  console.log('CONCURRENT',clients,round,impl);
  const workers=[],sessions=[];
  try{
   if(impl==='noderel-bfs')for(let i=0;i<clients;i++){
    const worker=new Worker(new URL('./worker.mjs',import.meta.url));
    await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);});workers.push(worker);
   }else for(let i=0;i<clients;i++)sessions.push(driver.session({database:'neo4j',defaultAccessMode:neo4j.session.READ}));
   async function request(client,index){return impl==='neo4j-bolt'?runNeo4j(sessions[client],'reach6',cases[index]):workerRequest(workers[client],{workload:'reach6',p:cases[index],algorithm:'bfs'});}
   await Promise.all(Array.from({length:clients},async(_,c)=>{for(let j=0;j<2;j++){const index=(c+j*6)%cases.length;check((await request(c,index)).value,'reach6',index);}}));
   const raw=[],start=performance.now();let next=0;
   await Promise.all(Array.from({length:clients},async(_,client)=>{
    while(performance.now()-start<10000){
     const index=next++%cases.length,t=performance.now();const value=await request(client,index);const ms=performance.now()-t;
     check(value.value,'reach6',index);raw.push({caseIndex:index,ms,executionMs:value.executionMs});
    }
   }));
   const elapsedMs=performance.now()-start;
   const row={implementation:impl,clients,round,elapsedMs,requestsPerSecond:raw.length*1000/elapsedMs,...stats(raw.map(x=>x.ms)),raw};
   result.concurrency.push(row);console.log('CONCURRENCY_RESULT',JSON.stringify({...row,raw:undefined}));save();
  }finally{await Promise.all(workers.map(w=>w.terminate()));await Promise.all(sessions.map(s=>s.close()));}
 }
 result.completed=true;result.finishedAt=new Date().toISOString();save();
 console.log('DONE',result.verification.aggregateChecks);
}finally{graph.close();await session.close();await driver.close();}
