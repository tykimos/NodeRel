import { readFileSync, writeFileSync } from 'node:fs';
import { NodeRel } from '../../src/noderel.mjs';

export const TYPES = ['OFFICER_OF','INTERMEDIARY_OF','REGISTERED_ADDRESS'];
export const FILE = new URL('./paradise.sqlite',import.meta.url).pathname;
export const SEED = 20260924;
export const BOLT = 'bolt://127.0.0.1:17687';
export const options = (p,depth=10) => ({id:p.id,targetId:p.targetId,scope:'paradise',direction:'both',types:TYPES,maxDepth:depth});
const pattern = TYPES.join('|');
export function cypher(workload) {
 if(workload==='shortest')return `MATCH (s:Paradise {id:$id}),(t:Paradise {id:$targetId}) MATCH p=shortestPath((s)-[:${pattern}*1..10]-(t)) RETURN length(p) AS distance`;
 const depth=Number(workload.replace('full','').replace('reach',''));
 if(![4,6,8].includes(depth))throw new Error('Unsupported workload');
 const base=`MATCH p=(s:Paradise {id:$id})-[:${pattern}*1..${depth}]-(n) WITH s,n,min(length(p)) AS depth WHERE n<>s `;
 return base+(workload.startsWith('full')?'RETURN n.id AS id,n.title AS title,n.kind AS kind,depth ORDER BY depth,id':'RETURN count(n) AS count,coalesce(sum(depth),0) AS depthSum');
}
export function openGraph(){
 const g=new NodeRel(FILE,{readOnly:true});
 g.db.exec('PRAGMA cache_size=-65536; PRAGMA temp_store=MEMORY; PRAGMA query_only=ON;');
 return g;
}
export function runNodeRel(g,workload,p,algorithm){
 if(workload==='shortest')return {distance:g.shortestDistance({...options(p),algorithm})};
 const opts={...options(p,Number(workload.replace('full','').replace('reach',''))),algorithm};
 return workload.startsWith('full')?g.trace(opts).map(r=>({...r})):{...g.traceStats(opts)};
}
export async function runNeo4j(session,workload,p){
 const r=await session.run(cypher(workload),p,{timeout:60000});
 return {value:workload.startsWith('full')?r.records.map(r=>r.toObject()):(r.records[0]?.toObject()||{distance:null}),availableMs:r.summary.resultAvailableAfter,consumedMs:r.summary.resultConsumedAfter};
}
export function stats(times){
 const sorted=[...times].sort((a,b)=>a-b);
 return {n:times.length,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],minMs:sorted[0],maxMs:sorted.at(-1)};
}
export function referenceGraph(){
 const data=JSON.parse(readFileSync(new URL('./dataset.json',import.meta.url),'utf8'));
 const adjacency=new Map(data.nodes.map(n=>[n.id,new Set()]));
 let selectedRelationships=0;
 for(const e of data.edges)if(TYPES.includes(e.type)){
  adjacency.get(e.from).add(e.to);adjacency.get(e.to).add(e.from);selectedRelationships++;
 }
 return {data,adjacency,selectedRelationships};
}
export function referenceDistances(adjacency,id,maxDepth=10){
 const seen=new Map([[id,0]]),queue=[id];
 for(let head=0;head<queue.length;head++){
  const node=queue[head],depth=seen.get(node);
  if(depth===maxDepth)continue;
  for(const next of adjacency.get(node))if(!seen.has(next)){seen.set(next,depth+1);queue.push(next);}
 }
 return seen;
}
export function expectedRows(data,distances,maxDepth){
 return data.nodes.filter(n=>distances.get(n.id)>0&&distances.get(n.id)<=maxDepth).map(n=>({id:n.id,title:n.title,kind:n.kind,depth:distances.get(n.id)})).sort((a,b)=>a.depth-b.depth||(a.id<b.id?-1:a.id>b.id?1:0));
}
export function generateCases(){
 const {data,adjacency,selectedRelationships}=referenceGraph();
 let state=SEED;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
 const groups={low:[],medium:[],high:[]};let isolates=0;
 for(const n of data.nodes){const d=adjacency.get(n.id).size;if(!d){isolates++;continue;}groups[d===1?'low':d<=4?'medium':'high'].push(n);}
 const cases=[];
 for(const [stratum,pool]of Object.entries(groups)){
  const candidates=[...pool];
  for(let i=candidates.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
  for(const node of candidates.slice(0,6)){
   const distances=referenceDistances(adjacency,node.id),mode=['near','far','random'][cases.length%3];
   let targets;
   if(mode==='random')targets=data.nodes.filter(n=>n.id!==node.id).map(n=>n.id);
   else targets=[...distances].filter(([,d])=>mode==='near'?d>=1&&d<=2:d>=5&&d<=10).map(([id])=>id);
   let fallback=false;
   if(!targets.length){fallback=true;const farthest=[...distances.values()].reduce((max,d)=>Math.max(max,d),0);targets=[...distances].filter(([,d])=>d===farthest).map(([id])=>id);}
   const targetId=targets[Math.floor(random()*targets.length)];
   const expected={shortest:{distance:distances.get(targetId)??null}};
   for(const depth of [4,6,8]){let count=0,depthSum=0;for(const d of distances.values())if(d>0&&d<=depth){count++;depthSum+=d;}expected[`reach${depth}`]={count,depthSum};}
   cases.push({id:node.id,kind:node.kind,degree:adjacency.get(node.id).size,stratum,targetId,targetMode:mode,targetFallback:fallback,expected});
  }
 }
 const metadata={seed:SEED,sampling:'Six sources per positive-degree stratum (1; 2–4; >=5 distinct neighbors), seeded Fisher-Yates shuffle. No timing-based selection. Targets alternate distance 1–2, distance 5–10, and random graph-wide node; missing distance bands fall back to the farthest reachable node within ten hops.',strata:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),isolatedNodes:isolates,selectedRelationshipTypes:TYPES,selectedRelationships,maxDegree:[...adjacency.values()].reduce((max,x)=>Math.max(max,x.size),0),cases};
 writeFileSync(new URL('./cases.json',import.meta.url),JSON.stringify(metadata,null,2)+'\n');
 return metadata;
}
