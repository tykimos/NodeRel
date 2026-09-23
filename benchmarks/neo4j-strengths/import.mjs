import neo4j from 'neo4j-driver';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { dataset,N,DEGREE,SEED,id } from './common.mjs';
import { SCHEMA } from './schema.mjs';
const g=dataset();const db=new DatabaseSync(new URL('./bench.sqlite',import.meta.url));db.exec(SCHEMA);db.exec('PRAGMA cache_size=-65536; BEGIN; DELETE FROM links; DELETE FROM items;');
const node=db.prepare('INSERT INTO items(id,kind,scope,title,status) VALUES(?,?,?,?,?)'),edge=db.prepare('INSERT INTO links(from_id,to_id,type,scope,attrs) VALUES(?,?,?,?,?)');
let start=performance.now();for(let i=0;i<N;i++)node.run(id(i),'Bench','bench',id(i),i%10===0?'inactive':'active');for(const e of g.edges)edge.run(e.a,e.b,'LINK','bench','{}');db.exec('COMMIT; CREATE INDEX IF NOT EXISTS links_reverse_cover ON links(to_id,from_id,type); ANALYZE; PRAGMA wal_checkpoint(TRUNCATE);');console.log('SQLite loaded',N,g.edges.length,performance.now()-start);db.close();
const driver=neo4j.driver('bolt://127.0.0.1:17687',neo4j.auth.none(),{disableLosslessIntegers:true,maxConnectionPoolSize:16});const session=driver.session({database:'neo4j'});
try{
 await session.run('CREATE CONSTRAINT bench_id IF NOT EXISTS FOR (n:Bench) REQUIRE n.id IS UNIQUE');
 const existing=await session.run('MATCH (n:Bench) RETURN count(n) AS count');if(existing.records[0].get('count'))throw new Error('Refusing duplicate import into populated benchmark database');
 start=performance.now();
 for(let i=0;i<N;i+=5000){await session.run('UNWIND $rows AS r CREATE (:Bench {id:r.id,status:r.status})',{rows:Array.from({length:Math.min(5000,N-i)},(_,j)=>({id:id(i+j),status:(i+j)%10===0?'inactive':'active'}))});}
 for(let i=0;i<g.edges.length;i+=10000){await session.run('UNWIND $rows AS r MATCH (a:Bench {id:r.a}),(b:Bench {id:r.b}) CREATE (a)-[:LINK]->(b)',{rows:g.edges.slice(i,i+10000)});if(i%50000===0)console.log('Neo4j edges',i+10000);}
 console.log('Neo4j loaded',performance.now()-start);
 await session.run('CALL db.awaitIndexes()');
 const counts=await session.run('MATCH (n:Bench) OPTIONAL MATCH (n)-[r:LINK]->() RETURN count(DISTINCT n) AS nodes,count(r) AS edges');console.log(counts.records[0].toObject());
 writeFileSync(new URL('./dataset.json',import.meta.url),JSON.stringify({N,DEGREE,SEED,edges:g.edges.length}));
}finally{await session.close();await driver.close();}
