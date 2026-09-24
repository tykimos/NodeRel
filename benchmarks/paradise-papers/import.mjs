import neo4j from 'neo4j-driver';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { NodeRel } from '../../src/noderel.mjs';
import { createHash } from 'node:crypto';
const bytes=readFileSync(new URL('./dataset.json',import.meta.url));
const source=JSON.parse(readFileSync(new URL('./sources.json',import.meta.url),'utf8'));
if(createHash('sha256').update(bytes).digest('hex')!==source.datasetSha256)throw new Error('Snapshot hash does not match sources.json.');
const data=JSON.parse(bytes);
const file=new URL('./paradise.sqlite',import.meta.url);
if(existsSync(file))throw new Error('paradise.sqlite already exists; preserve the previous run or explicitly remove it before importing.');
const driver=neo4j.driver('bolt://127.0.0.1:17687',neo4j.auth.none(),{disableLosslessIntegers:true});
const session=driver.session({database:'neo4j'});
const timings={};
try {
 const count=(await session.run('MATCH (n) RETURN count(n) AS count')).records[0].get('count');
 if(count)throw new Error('The dedicated target Neo4j database must be empty.');
 let start=performance.now();
 const graph=new NodeRel(file.pathname);
 try {
  const imported=graph.rebuild([data]);
  if(imported.rejected.length)throw new Error('Unexpected rejected edges');
  graph.db.exec('ANALYZE; PRAGMA wal_checkpoint(TRUNCATE);');
  timings.nodeRelImportMs=performance.now()-start;
  console.log('NodeRel',imported.nodes,imported.edges);
 }finally{graph.close();}
 start=performance.now();
 await session.run('CREATE CONSTRAINT paradise_id IF NOT EXISTS FOR (n:Paradise) REQUIRE n.id IS UNIQUE');
 for(let offset=0;offset<data.nodes.length;offset+=5000){
  const rows=data.nodes.slice(offset,offset+5000).map(({id,kind,scope,title})=>({id,kind,scope,title}));
  await session.run('UNWIND $rows AS row CREATE (n:Paradise) SET n=row',{rows});
 }
 for(const type of [...new Set(data.edges.map(e=>e.type))].sort()){
  if(!/^[A-Z_]+$/.test(type))throw new Error('Unexpected relationship type');
  const edges=data.edges.filter(e=>e.type===type);
  for(let offset=0;offset<edges.length;offset+=5000){
   await session.run(`UNWIND $rows AS row MATCH (a:Paradise {id:row.from}),(b:Paradise {id:row.to}) CREATE (a)-[r:${type}]->(b) SET r.scope=row.scope,r.attrs=row.attrs`,{rows:edges.slice(offset,offset+5000).map(e=>({...e,properties:undefined,attrs:JSON.stringify(e.properties)}))});
  }
  console.log('Neo4j relationships',type,edges.length);
 }
 await session.run('CALL db.awaitIndexes(60)');
 timings.neo4jImportMs=performance.now()-start;
 timings.neo4jCounts=(await session.run('MATCH (n:Paradise) OPTIONAL MATCH (n)-[r]->() RETURN count(DISTINCT n) AS nodes,count(r) AS edges')).records[0].toObject();
 timings.mapping='Both measured stores contain the identical normalized topology and id/kind/scope/title values. Neo4j uses a uniform Paradise label plus kind property; relationship properties are serialized JSON in both. Import times are setup observations, not an optimized bulk-import comparison.';
 writeFileSync(new URL('./import-results.json',import.meta.url),JSON.stringify(timings,null,2)+'\n');
 console.log(timings);
}finally{await session.close();await driver.close();}
