import assert from 'node:assert/strict';
import { NodeRel } from '../src/noderel.mjs';

function oracle(nodes, edges, options) {
 const { id, scope, direction = 'out', maxDepth = 10, types = [] } = options;
 const allowed = new Set(nodes.filter(n => n.scope === scope).map(n => n.id));
 if (!allowed.has(id)) return new Map();
 const adjacency = new Map([...allowed].map(n => [n, []]));
 for (const e of edges) {
  if (e.scope !== scope || !allowed.has(e.from) || !allowed.has(e.to) || (types.length && !types.includes(e.type))) continue;
  if (direction !== 'in') adjacency.get(e.from).push(e.to);
  if (direction !== 'out') adjacency.get(e.to).push(e.from);
 }
 const distances = new Map([[id, 0]]), queue = [id];
 for (let head = 0; head < queue.length; head++) {
  const node = queue[head], depth = distances.get(node);
  if (depth === maxDepth) continue;
  for (const next of adjacency.get(node)) if (!distances.has(next)) {
   distances.set(next, depth + 1); queue.push(next);
  }
 }
 return distances;
}

const graph = new NodeRel(':memory:');
let checks = 0;
try {
 let state = 20260924;
 const random = () => {state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32;};
 const nodes = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, kind: 'Thing', scope: i < 24 ? 'a' : 'b', title: `Node ${i}` }));
 const edges = [];
 for (const a of nodes) for (const b of nodes) if (a.id !== b.id && a.scope === b.scope && random() < .13) {
  edges.push({ from: a.id, to: b.id, scope: a.scope, type: random() < .5 ? 'X' : 'Y' });
 }
 graph.rebuild([{ nodes, edges }]);
 for (const direction of ['out', 'in', 'both']) for (const types of [[], ['X'], ['X', 'X'], ['Y'], ['missing']]) {
  for (const maxDepth of [0, 1, 2, 4, 10]) for (const id of ['n0', 'n7', 'n23', 'n24', 'missing']) {
   const opts = { id, scope: 'a', direction, maxDepth, types };
   const expected = oracle(nodes, edges, opts);
   const basic = graph.trace(opts), bfs = graph.trace({ ...opts, algorithm: 'bfs' });
   assert.deepEqual(bfs, basic);
   assert.deepEqual(new Map(bfs.map(n => [n.id, n.depth])), new Map([...expected].filter(([n]) => n !== id).sort((a,b) => a[1]-b[1] || (a[0]<b[0]?-1:1))));
   const aggregate = { count: bfs.length, depthSum: bfs.reduce((s,n) => s+n.depth, 0) };
   for (const algorithm of ['sql', 'bfs']) {
    assert.deepEqual({ ...graph.traceStats({ ...opts, algorithm }) }, aggregate);
    for (const targetId of ['n0','n4','n13','n24','missing',id]) {
     assert.equal(graph.shortestDistance({ ...opts, targetId, algorithm }), expected.get(targetId) ?? null);
     checks++;
    }
   }
  }
 }
 // Cross-scope links inserted through the raw handle must never leak nodes.
 graph.db.prepare('INSERT INTO links VALUES(?,?,?,?,?)').run('n0','n24','X','a','{}');
 assert.deepEqual(graph.trace({id:'n0',scope:'a',algorithm:'bfs'}), graph.trace({id:'n0',scope:'a'}));
 assert.equal(graph.shortestDistance({id:'n0',targetId:'n24',scope:'a'}), null);
 // Validate before opening a transaction, and preserve transactions owned by callers.
 for (const algorithm of ['sql','bfs']) for (const maxDepth of [-1, 11, 1.5]) {
  assert.throws(() => graph.trace({id:'n0',scope:'a',algorithm,maxDepth}));
 }
 assert.throws(() => graph.trace({id:'n0',scope:'a',algorithm:'other'}));
 assert.throws(() => graph.shortestDistance({id:'n0',scope:'a'}));
 assert.equal(graph.db.isTransaction, false);
 graph.db.exec('BEGIN');
 graph.trace({id:'n0',scope:'a',algorithm:'bfs'});
 graph.shortestDistance({id:'n0',targetId:'n4',scope:'a'});
 assert.equal(graph.db.isTransaction, true);
 graph.db.exec('ROLLBACK');
 // More than one adjacency batch, cycles, parallel different-type links and SQL ordering.
 const largeNodes = ['start', ...Array.from({length: 600}, (_, i) => `wide:${i}`), '😀', '\uE000'].map(id => ({id, kind:'Thing', scope:'wide', title:id}));
 const largeEdges = largeNodes.slice(1).flatMap(n => [{from:'start',to:n.id,type:'X',scope:'wide'}, {from:n.id,to:'start',type:'Y',scope:'wide'}]);
 graph.rebuild([{nodes:largeNodes,edges:largeEdges}]);
 const opts = {id:'start',scope:'wide',direction:'both',maxDepth:10};
 assert.deepEqual(graph.trace({...opts,algorithm:'bfs'}),graph.trace(opts));
 assert.deepEqual(graph.traceStats({...opts,algorithm:'bfs'}),{count:602,depthSum:602});
 assert.equal(graph.shortestDistance({...opts,id:'wide:599',targetId:'😀'}),2);
 // Prepared statements may be reused, but graph data/results must be read afresh.
 graph.rebuild([{nodes:largeNodes,edges:[]}]);
 assert.equal(graph.shortestDistance({...opts,id:'wide:599',targetId:'😀'}),null);
 assert.deepEqual(graph.trace({...opts,algorithm:'bfs'}),[]);
 assert.equal(graph.db.isTransaction, false);
 console.log(`PASS BFS/SQL/reference parity, ${checks} shortest-distance checks, batching, scopes, ordering, transactions and rebuild freshness`);
} finally { graph.close(); }
