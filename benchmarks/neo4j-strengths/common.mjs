import { DatabaseSync } from 'node:sqlite';
export const N=50000, DEGREE=6, SEED=20260923;
export const id=n=>`n${String(n).padStart(5,'0')}`;
export function random(seed){let x=seed>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
export function dataset(){
 const rng=random(SEED),out=Array.from({length:N},()=>[]),incoming=Array.from({length:N},()=>[]),edges=[];
 for(let a=0;a<N;a++){
  const set=new Set([(a+1)%N]);
  while(set.size<DEGREE){const b=Math.floor(rng()*N);if(b!==a)set.add(b);}
  for(const b of set){out[a].push(b);incoming[b].push(a);edges.push({a:id(a),b:id(b)});}
 }
 return {out,incoming,edges};
}
export function oracle(g,source,maxDepth=10,target=null,filtered=false){
 const start=Number(source.slice(1)),dst=target===null?null:Number(target.slice(1));
 if(filtered&&(start%10===0||(dst!==null&&dst%10===0)))return dst===null?{count:0,depthSum:0}:null;
 const dist=new Int16Array(N).fill(-1);dist[start]=0;let frontier=[start];
 for(let depth=1;depth<=maxDepth&&frontier.length;depth++){
  const next=[];
  for(const a of frontier)for(const b of g.out[a])if(dist[b]===-1&&(!filtered||b%10!==0)){dist[b]=depth;if(b===dst)return depth;next.push(b);}
  frontier=next;
 }
 if(dst!==null)return dist[dst]<0?null:dist[dst];
 let count=0,depthSum=0;for(const d of dist)if(d>0){count++;depthSum+=d;}return {count,depthSum};
}
export const CYPHER={
 floor:'RETURN 1 AS value',
 point:'MATCH (n:Bench {id:$source}) RETURN n.id AS value',
 shortest:'MATCH (s:Bench {id:$source}), (t:Bench {id:$target}) MATCH p=shortestPath((s)-[:LINK*1..10]->(t)) RETURN length(p) AS distance',
 filtered:'MATCH (s:Bench {id:$source}), (t:Bench {id:$target}) MATCH p=shortestPath((s)-[:LINK*1..10]->(t)) WHERE all(n IN nodes(p) WHERE n.status = "active") RETURN length(p) AS distance',
 reach3:'MATCH p=(s:Bench {id:$source})-[:LINK*1..3]->(n) WITH s,n,min(length(p)) AS depth WHERE n <> s RETURN count(n) AS count, coalesce(sum(depth),0) AS depthSum',
 reach6:'MATCH p=(s:Bench {id:$source})-[:LINK*1..6]->(n) WITH s,n,min(length(p)) AS depth WHERE n <> s RETURN count(n) AS count, coalesce(sum(depth),0) AS depthSum',
};
export class SqlReader{
 constructor(file){
  this.db=new DatabaseSync(file,{readOnly:true});this.db.exec('PRAGMA cache_size=-65536; PRAGMA temp_store=MEMORY; PRAGMA query_only=ON;');
  this.one=this.db.prepare('SELECT id AS value FROM items WHERE id=?');this.floor=this.db.prepare('SELECT 1 AS value');this.status=this.db.prepare('SELECT status FROM items WHERE id=?');this.stmts=new Map();
  this.cte=new Map();
  for(const filtered of [false,true])this.cte.set(filtered,this.db.prepare(`WITH RECURSIVE walk(id,depth) AS (
   SELECT id,0 FROM items WHERE id=:source ${filtered?"AND status='active'":''}
   UNION SELECT l.to_id,w.depth+1 FROM walk w JOIN links l ON l.from_id=w.id AND l.type='LINK'
   JOIN items i ON i.id=l.to_id AND i.scope='bench' ${filtered?"AND i.status='active'":''}
   WHERE w.depth<:maxDepth AND l.scope='bench'
  ), depths AS (SELECT id,min(depth) AS depth FROM walk WHERE id<>:source GROUP BY id)
  SELECT count(*) AS count,coalesce(sum(depth),0) AS depthSum,min(CASE WHEN id=:target THEN depth END) AS distance FROM depths`));
 }
 neighbors(frontier,reverse=false,filtered=false){
  const result=[];
  for(let i=0;i<frontier.length;i+=256){
   const part=frontier.slice(i,i+256),key=`${part.length}:${reverse}:${filtered}`;
   if(!this.stmts.has(key)){
    const a=reverse?'to_id':'from_id',b=reverse?'from_id':'to_id';
    this.stmts.set(key,this.db.prepare(`SELECT l.${b} AS id FROM links l ${filtered?`JOIN items n ON n.id=l.${b}`:''}
     WHERE l.${a} IN (${part.map(()=>'?').join(',')}) AND l.type='LINK' AND l.scope='bench' ${filtered?"AND n.status='active'":''}`));
   }
   result.push(...this.stmts.get(key).all(...part));
  }
  return result;
 }
 shortest(source,target,filtered=false,maxDepth=10){
  if(source===target)return 0;
  if(filtered&&(this.status.get(source)?.status!=='active'||this.status.get(target)?.status!=='active'))return null;
  let left=[source],right=[target],dl=0,dr=0;
  const seenL=new Map([[source,0]]),seenR=new Map([[target,0]]);
  while(left.length&&right.length&&dl+dr<maxDepth){
   const forward=left.length<=right.length,front=forward?left:right,own=forward?seenL:seenR,other=forward?seenR:seenL;
   const depth=forward?++dl:++dr,next=[];let best=Infinity;
   for(const {id:node} of this.neighbors(front,!forward,filtered))if(!own.has(node)){
    own.set(node,depth);next.push(node);if(other.has(node))best=Math.min(best,depth+other.get(node));
   }
   if(best!==Infinity)return best<=maxDepth?best:null;
   if(forward)left=next;else right=next;
  }
  return null;
 }
 reach(source,maxDepth=6){
  const seen=new Set([source]);let frontier=[source],count=0,depthSum=0;
  for(let depth=1;depth<=maxDepth&&frontier.length;depth++){
   const next=[];
   for(const {id:node} of this.neighbors(frontier))if(!seen.has(node)){seen.add(node);next.push(node);count++;depthSum+=depth;}
   frontier=next;
  }
  return {count,depthSum};
 }
 run(workload,p,implementation='optimized'){
  if(workload==='floor')return this.floor.get();if(workload==='point')return this.one.get(p.source);
  const shortest=['shortest','filtered'].includes(workload),depth=shortest?10:Number(workload.slice(5));
  if(implementation==='cte'){
   const r=this.cte.get(workload==='filtered').get({source:p.source,target:shortest?p.target:'',maxDepth:depth});
   return shortest?{distance:r.distance}:{count:r.count,depthSum:r.depthSum};
  }
  return shortest?{distance:this.shortest(p.source,p.target,workload==='filtered',depth)}:this.reach(p.source,depth);
 }
 close(){this.db.close();}
}
export function parameters(n=24){const rng=random(SEED+1),cases=[];while(cases.length<n){let a=Math.floor(rng()*N),b=Math.floor(rng()*N);if(a===b||a%10===0||b%10===0)continue;cases.push({source:id(a),target:id(b)});}return cases;}
export function stats(xs){const sorted=[...xs].sort((a,b)=>a-b);return{n:xs.length,medianMs:sorted[Math.floor(xs.length/2)],p95Ms:sorted[Math.ceil(xs.length*.95)-1],minMs:sorted[0],maxMs:sorted.at(-1)};}
