import neo4j from 'neo4j-driver';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const dump = process.argv[2];
if (!dump) throw new Error('Usage: node export-source.mjs /path/to/paradise-43.dump');
const dumpSha256=createHash('sha256').update(readFileSync(dump)).digest('hex');
if(dumpSha256!=='eb9e80ab546783f538e544f5385bc04309d69a76bfae1fb3ce0e49d6e06b38f1')throw new Error('The source dump does not match the pinned official artifact.');
const driver = neo4j.driver(process.env.SOURCE_BOLT || 'bolt://127.0.0.1:18687', neo4j.auth.none(), { disableLosslessIntegers: true });
const session = driver.session({ database: 'neo4j', defaultAccessMode: neo4j.session.READ });
const scope = 'paradise';
try {
 const nodes = (await session.run('MATCH (n) RETURN id(n) AS key,labels(n) AS labels,properties(n) AS properties ORDER BY key')).records.map(r => {
  const { key, labels, properties } = r.toObject();
  return { id: `pp:${key}`, kind: [...labels].sort().join('|'), scope, title: properties.name || properties.address || '', source: { labels, properties } };
 });
 const rawEdges = (await session.run('MATCH (a)-[r]->(b) RETURN id(a) AS a,id(b) AS b,type(r) AS type,id(r) AS key,properties(r) AS properties ORDER BY key')).records.map(r => r.toObject());
 if(nodes.length!==163414||rawEdges.length!==364456)throw new Error('The source server does not have the expected pinned graph counts.');
 const seen = new Set(), edges = [];
 let selfLoops = 0, duplicateTuples = 0;
 for (const e of rawEdges) {
  if (e.a === e.b) { selfLoops++; continue; }
  const key = JSON.stringify([e.a,e.b,e.type]);
  if (seen.has(key)) { duplicateTuples++; continue; }
  seen.add(key);
  edges.push({ from:`pp:${e.a}`, to:`pp:${e.b}`, type:e.type, scope, properties:e.properties });
 }
 const data = { scope, nodes, edges };
 const serialized = JSON.stringify(data);
 writeFileSync(new URL('./dataset.json',import.meta.url), serialized);
 const provenance = {
  retrievedAt: new Date().toISOString(),
  repository: 'https://github.com/neo4j-graph-examples/icij-paradise-papers',
  commit: '76438607087f42986c80b61b681a48c151f7f39e',
  url: 'https://raw.githubusercontent.com/neo4j-graph-examples/icij-paradise-papers/76438607087f42986c80b61b681a48c151f7f39e/data/icij-paradise-papers-43.dump',
  dumpSha256,
  datasetSha256: createHash('sha256').update(serialized).digest('hex'),
  extractionServer: (await session.run('CALL dbms.components() YIELD versions,edition RETURN versions,edition')).records[0].toObject(),
  sourceNodes: nodes.length, sourceRelationships: rawEdges.length,
  projectedNodes: nodes.length, projectedRelationships: edges.length,
  removedSelfLoops: selfLoops, collapsedDuplicateTuples: duplicateTuples,
  mapping: 'Dump-internal node IDs prefixed pp:. Original labels retained as kind; original node attributes retained only in source snapshot. Equal (from,to,type) tuples collapsed in relationship-ID order and self-loops removed in BOTH measured databases. These changes preserve nonzero reachability/minimum distance between distinct nodes; multiplicity/property queries are outside this benchmark.',
  notice: 'Public ICIJ data: inclusion of a person or entity does not imply wrongdoing. Benchmark identifiers are record IDs; no identity resolution is performed.',
 };
 writeFileSync(new URL('./sources.json',import.meta.url),JSON.stringify(provenance,null,2)+'\n');
 console.log(JSON.stringify(provenance,null,2));
} finally { await session.close(); await driver.close(); }
