import neo4j from 'neo4j-driver';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {BOLT,generateCases,openGraph,runNodeRel,runNeo4j,cypher} from './common.mjs';
const cases=generateCases().cases;
const graph=openGraph(),driver=neo4j.driver(BOLT,neo4j.auth.none(),{disableLosslessIntegers:true});
const session=driver.session({database:'neo4j',defaultAccessMode:neo4j.session.READ});
const rows=[];
try{
 for(const index of [0,6,12])for(const workload of ['reach4','reach6','reach8','shortest']){
  const p=cases[index];
  for(const impl of ['bfs','neo4j','sql']){
   const start=performance.now();
   const value=impl==='neo4j'?(await runNeo4j(session,workload,p)).value:runNodeRel(graph,workload,p,impl);
   const ms=performance.now()-start;
   assert.deepEqual(value,p.expected[workload]);
   const row={index,stratum:p.stratum,degree:p.degree,workload,impl,ms,value};rows.push(row);console.log(JSON.stringify(row));
   writeFileSync(new URL('./probe-results.json',import.meta.url),JSON.stringify(rows,null,2));
  }
 }
 const profile=(await session.run('PROFILE '+cypher('reach8'),cases[12])).summary.profile;
 console.log('PROFILE',JSON.stringify(profile));
}finally{graph.close();await session.close();await driver.close();}
