import neo4j from 'neo4j-driver';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { cpus, totalmem } from 'node:os';
import assert from 'node:assert/strict';
import { BOLT, TYPES, openGraph, runNodeRel, runNeo4j, stats } from './common.mjs';

const out = new URL('./optimization-results.json', import.meta.url);
if (existsSync(out)) throw new Error('Preserve optimization-results.json before an intentional rerun');
const previous = JSON.parse(readFileSync(new URL('./results.json', import.meta.url)));
const { cases } = previous.sampling;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const result = { startedAt: new Date().toISOString(), completed: false,
 environment: { node: process.version, cpu: cpus()[0].model, logicalCpus: cpus().length, memoryBytes: totalmem(), neoHeapMiB: 1024, neoPageCacheMiB: 1024, sqliteCacheMiB: 64 },
 methodology: { cases: 'Same fixed 18 cases and independently computed expectations as results.json; also used during optimization development. No held-out performance claim.', single: 'Two rounds per case/workload, rotating implementation order. Same API outputs. CSR top-down ablation and adaptive default both measured. Ready-projection latency excludes construction, which is separately measured in three fresh processes. All current timings, not substituted prior values.', warmups: { onDemandBfs: 3, projectionsAndNeo4j: 36 }, concurrency: 'CSR adaptive versus Neo4j: exactly 360 requests per condition (20 per case), 1/8/16 clients, two rounds reversing engine order. One private projection per worker or one Bolt session per client. Includes final drain and worker messaging, excludes worker creation, projection builds and warmup. Finite-batch throughput, not sustained capacity.', boundaries: 'Warm OS/database caches. CSR is a fixed in-memory scope/type projection; database changes require explicit replacement. No cached answers. Neo4j comparison is Cypher over Bolt, not GDS or equal-memory engine-only testing.' },
 verification: { topology: null, fullSets: [], aggregateChecks: 0 }, builds: [], single: [], fullRows: [], concurrency: [] };
const save = () => writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
for (let i = 0; i < 3; i++) result.builds.push(JSON.parse(execFileSync(process.execPath, ['--expose-gc', new URL('./projection-build.mjs', import.meta.url).pathname], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })));
console.log('BUILDS', result.builds.map(x => x.buildMs));
const graph = openGraph();
let graphClosed = false;
result.environment.sqlite = graph.db.prepare('SELECT sqlite_version() AS version').get().version;
const projection = graph.project({ scope: 'paradise', types: TYPES });
const driver = neo4j.driver(BOLT, neo4j.auth.none(), { disableLosslessIntegers: true, maxConnectionPoolSize: 20 });
const session = driver.session({ database: 'neo4j', defaultAccessMode: neo4j.session.READ });
const impls = ['noderel-bfs', 'csr-bfs', 'csr-adaptive', 'neo4j-bolt'];
function projected(workload, p, algorithm = 'adaptive') {
 const options = { id: p.id, direction: 'both', maxDepth: Number(workload.replace('reach', '').replace('full', '')), algorithm };
 return workload === 'shortest' ? { distance: projection.shortestDistance({ id: p.id, targetId: p.targetId, direction: 'both', maxDepth: 10 }) } : workload.startsWith('full') ? projection.trace(options).map(x => ({ ...x })) : projection.traceStats(options);
}
async function run(impl, workload, p) {
 return impl === 'neo4j-bolt' ? (await runNeo4j(session, workload, p)).value : impl === 'noderel-bfs' ? runNodeRel(graph, workload, p, 'bfs') : projected(workload, p, impl === 'csr-bfs' ? 'bfs' : 'adaptive');
}
function check(value, workload, i) { assert.deepEqual(value, cases[i].expected[workload]); result.verification.aggregateChecks++; }
async function verify() {
 const nodes = graph.db.prepare('SELECT id,kind,scope,title FROM items ORDER BY id').all().map(x => ({ ...x }));
 const edges = graph.db.prepare('SELECT from_id AS "from",to_id AS "to",type,scope FROM links ORDER BY from_id,to_id,type').all().map(x => ({ ...x }));
 const neoNodes = (await session.run('MATCH (n:Paradise) RETURN n.id AS id,n.kind AS kind,n.scope AS scope,n.title AS title ORDER BY id')).records.map(x => x.toObject());
 const neoEdges = (await session.run('MATCH (a:Paradise)-[r]->(b:Paradise) RETURN a.id AS from,b.id AS to,type(r) AS type,r.scope AS scope ORDER BY from,to,type')).records.map(x => x.toObject());
 assert.equal(hash(nodes), previous.verification.topology.nodeHash); assert.equal(hash(edges), previous.verification.topology.edgeHash);
 assert.deepEqual(neoNodes, nodes); assert.deepEqual(neoEdges, edges);
 result.verification.topology = { ...previous.verification.topology, projectionRelationships: projection.info.relationships };
 for (const i of [0, 6, 12]) for (const impl of impls) {
  const rows = await run(impl, 'full6', cases[i]);
  const expected = previous.verification.fullSets.find(x => x.caseIndex === i);
  assert.equal(hash(rows), expected.sha256);
  result.verification.fullSets.push({ caseIndex: i, implementation: impl, rows: rows.length, sha256: expected.sha256 });
 }
}
function send(worker, message) { return new Promise((resolve, reject) => {
 const onError = e => { worker.off('message', receive); reject(e); };
 const receive = r => { worker.off('error', onError); r.error ? reject(new Error(r.error)) : resolve(r); };
 worker.once('error', onError); worker.once('message', receive); worker.postMessage(message);
}); }
try {
 await driver.verifyConnectivity();
 result.environment.neo4j = (await session.run('CALL dbms.components() YIELD versions,edition RETURN versions,edition')).records[0].toObject();
 console.log('VERIFY'); await verify(); global.gc?.(); save();
 for (const workload of ['reach4', 'reach6', 'reach8', 'shortest']) {
  // Both CSR variants share the same degree-aware distance implementation.
  const active = workload === 'shortest' ? impls.filter(x => x !== 'csr-bfs') : impls;
  for (const impl of active) for (let j = 0; j < (impl === 'noderel-bfs' ? 3 : 36); j++) { const i = impl === 'noderel-bfs' ? j * 6 : j % cases.length; check(await run(impl, workload, cases[i]), workload, i); }
  const raw = Object.fromEntries(active.map(impl => [impl, []]));
  for (let round = 0; round < 2; round++) for (let i = 0; i < cases.length; i++) for (let k = 0; k < active.length; k++) {
   const impl = active[(i + round + k) % active.length], started = performance.now();
   const value = await run(impl, workload, cases[i]), ms = performance.now() - started;
   check(value, workload, i); raw[impl].push({ round, caseIndex: i, ms, value });
  }
  for (const impl of active) { const row = { workload, implementation: impl, ...stats(raw[impl].map(x => x.ms)), raw: raw[impl] }; result.single.push(row); console.log('RESULT', workload, impl, row.medianMs); }
  save();
 }
 for (const i of [0, 6, 12]) for (let round = 0; round < 2; round++) for (let k = 0; k < impls.length; k++) {
  const impl = impls[(i + round + k) % impls.length], started = performance.now();
  const value = await run(impl, 'full6', cases[i]), ms = performance.now() - started;
  assert.equal(hash(value), previous.verification.fullSets.find(x => x.caseIndex === i).sha256);
  result.fullRows.push({ caseIndex: i, implementation: impl, round, rows: value.length, ms });
 }
 save(); projection.close(); graph.close(); graphClosed = true; global.gc?.();
 for (const clients of [1, 8, 16]) for (let round = 0; round < 2; round++) for (const impl of round ? ['csr-adaptive', 'neo4j-bolt'] : ['neo4j-bolt', 'csr-adaptive']) {
  const workers = [], sessions = [], builds = [], setupStart = performance.now();
  try {
   if (impl === 'csr-adaptive') for (let i = 0; i < clients; i++) {
    const worker = new Worker(new URL('./projection-worker.mjs', import.meta.url)); workers.push(worker);
    builds.push(await new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); }));
   } else for (let i = 0; i < clients; i++) sessions.push(driver.session({ database: 'neo4j', defaultAccessMode: neo4j.session.READ }));
   const setupMs = performance.now() - setupStart;
   const request = (client, i) => impl === 'neo4j-bolt' ? runNeo4j(sessions[client], 'reach6', cases[i]) : send(workers[client], { p: cases[i] });
   await Promise.all(Array.from({ length: clients }, async (_, c) => { for (let j = 0; j < 6; j++) { const i = (c + j * 3) % cases.length; check((await request(c, i)).value, 'reach6', i); } }));
   let next = 0; const raw = [], started = performance.now(), totalRequests = cases.length * 20;
   await Promise.all(Array.from({ length: clients }, async (_, c) => { for (;;) {
    const job = next++; if (job >= totalRequests) return; const i = job % cases.length, start = performance.now();
    const value = await request(c, i), ms = performance.now() - start;
    check(value.value, 'reach6', i); raw.push({ job, caseIndex: i, ms });
   } }));
   const elapsedMs = performance.now() - started;
   for (let i = 0; i < cases.length; i++) assert.equal(raw.filter(x => x.caseIndex === i).length, 20);
   const row = { implementation: impl, clients, round, setupMs, builds, elapsedMs, requestsPerSecond: raw.length * 1000 / elapsedMs, ...stats(raw.map(x => x.ms)), raw };
   result.concurrency.push(row); save(); console.log('CONCURRENT', clients, round, impl, row.requestsPerSecond);
  } finally { await Promise.all(workers.map(w => w.terminate())); await Promise.all(sessions.map(s => s.close())); }
 }
 result.finishedAt = new Date().toISOString(); result.completed = true; save();
} finally { projection.close(); if (!graphClosed) graph.close(); await session.close(); await driver.close(); }
