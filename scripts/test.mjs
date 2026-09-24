import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeRel } from '../src/noderel.mjs';
import { describeNodeRel } from '../src/describe.mjs';
import { cases, sqliteCase, canonical } from '../examples/neo4j/cases.mjs';
import { regressions } from '../examples/neo4j/test-core.mjs';

const dir=mkdtempSync(join(tmpdir(),'noderel-test-'));
const file=join(dir,'graph.sqlite');
const root=new URL('../examples/neo4j/',import.meta.url);
const json=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
const index=new NodeRel(file);
try {
 const counts=index.rebuild(['movies','northwind'].map(s=>json(`snapshots/${s}.json`)));
 assert.equal(counts.nodes,1206);assert.equal(counts.edges,3392);assert.equal(counts.rejected.length,0);
 const baseline=json('expected-results.json');
 for(const c of cases){
  const expected=baseline.find(x=>x.name===c.name);
  assert.ok(expected,`Missing baseline: ${c.name}`);
  assert.deepEqual(canonical(sqliteCase(index,c)),canonical(expected.result),c.name);
  console.log(`PASS ${c.name}`);
 }
 const boundaryChecks=regressions();
 const schema=describeNodeRel(file);
 const movies=schema.scopes.find(s=>s.scope==='movies');
 assert.equal(movies.nodeKinds.reduce((sum,k)=>sum+k.count,0),171);
 const acted=movies.observedRelationships.find(r=>r.type==='ACTED_IN');
 assert.equal(acted.fromKind,'Person');assert.equal(acted.toKind,'Movie');assert.equal(acted.count,172);
 assert.ok(acted.observedProperties.some(p=>p.name==='roles'&&p.jsonType==='array'));
 assert.equal(schema.scopes.find(s=>s.scope==='northwind').observedRelationships.reduce((sum,r)=>sum+r.count,0),3139);
 assert.equal(schema.sourceSignature,index.db.prepare("SELECT value FROM sync_meta WHERE key='signature'").get().value);
 assert.deepEqual(schema.existingOperations.trace.inputSchema.properties.algorithm.enum,['sql','bfs']);
 assert.equal(schema.existingOperations.traceStats.inputSchema.properties.algorithm.default,'sql');
 assert.ok(schema.existingOperations.shortestDistance.inputSchema.required.includes('targetId'));
 assert.equal(schema.existingOperations.shortestDistance.inputSchema.properties.algorithm.default,'bfs');
 assert.deepEqual(schema.existingOperations.project.inputSchema.required,['scope']);
 assert.deepEqual(schema.projectionOperations.trace.inputSchema.properties.algorithm.enum,['bfs','adaptive']);
 assert.equal(schema.projectionOperations.trace.inputSchema.properties.scope,undefined);
 assert.equal(schema.projectionOperations.trace.inputSchema.properties.types,undefined);
 assert.deepEqual(schema.projectionOperations.shortestDistance.inputSchema.required,['id','targetId']);
 const example=JSON.parse(readFileSync(new URL('../examples/ai/example.json',import.meta.url),'utf8'));
 assert.deepEqual(index.trace(example.arguments).map(r=>({...r})),example.result);
 assert.equal(index.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 console.log(`PASS ${cases.length} sample queries, ${boundaryChecks} boundary checks, AI schema/tool example, SQLite integrity`);
} finally {index.close();rmSync(dir,{recursive:true,force:true});}
