import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {NodeRel} from './noderel.mjs';
import {cases,sqliteCase,canonical} from './cases.mjs';
import {regressions} from './test-core.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const [command='test',...args]=process.argv.slice(2);
const nr=new NodeRel(path.join(root,'noderel.sqlite'),{readOnly:command!=='rebuild'});
try {
 if(command==='test'){
  const expected=JSON.parse(fs.readFileSync(path.join(root,'expected-results.json'),'utf8'));
  for(const c of cases){
   const baseline=expected.find(e=>e.name===c.name);assert.ok(baseline,`Missing baseline: ${c.name}`);
   assert.deepEqual(canonical(sqliteCase(nr,c)),canonical(baseline.result),c.name);
   console.log(`PASS ${c.name}`);
  }
  const count=regressions();
  console.log(`\n${cases.length}개 예제 질의와 ${count}개 경계 조건 통과. 저장된 Neo4j 기준 결과와 비교했습니다.`);
 } else if(command==='stats') {
  for(const scope of ['movies','northwind'])console.log(JSON.stringify({scope,...nr.stats(scope)},null,2));
 } else if(command==='list') {
  cases.forEach((c,i)=>console.log(`${i+1}. [${c.scope}] ${c.name}`));
 } else if(command==='show') {
  const n=Number(args[0]||1);if(!Number.isInteger(n)||n<1||n>cases.length)throw new Error(`예제 번호는 1..${cases.length}`);
  const c=cases[n-1];console.log(c.name);console.log(JSON.stringify(sqliteCase(nr,c),null,2));
 } else if(command==='trace') {
  const [scope,title,direction='out',depth='3',type]=args;
  const roots=nr.db.prepare('SELECT id FROM items WHERE scope=? AND title=?').all(scope,title);
  if(roots.length!==1)throw new Error(`시작 항목을 하나로 찾을 수 없습니다: ${title}`);
  console.log(JSON.stringify(nr.trace({id:roots[0].id,scope,direction,maxDepth:Number(depth),types:type?[type]:[]}),null,2));
 } else if(command==='rebuild') {
  const snapshots=['movies','northwind'].map(scope=>JSON.parse(fs.readFileSync(path.join(root,'snapshots',scope+'.json'),'utf8')));
  console.log(JSON.stringify(nr.rebuild(snapshots),null,2));nr.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
 } else throw new Error('명령: test, stats, list, show 번호, trace scope 이름 [out|in|both] [깊이] [관계종류], rebuild');
} finally {nr.close();}
