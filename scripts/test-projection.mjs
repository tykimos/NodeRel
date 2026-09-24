import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeRel } from '../src/noderel.mjs';

const graph = new NodeRel(':memory:');
let comparisons = 0;
try {
 let state = 20260925;
 const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
 // Dense directed graph exercises bottom-up's reverse adjacency and exact layers.
 const nodes = Array.from({ length: 90 }, (_, i) => ({ id: `n${i}`, kind: 'Thing', scope: i < 80 ? 'a' : 'b', title: `Node ${i}` }));
 const edges = [];
 for (const a of nodes) for (const b of nodes) if (a.id !== b.id && a.scope === b.scope && random() < .08) {
  edges.push({ from: a.id, to: b.id, scope: a.scope, type: random() < .5 ? 'X' : 'Y' });
 }
 graph.rebuild([{ nodes, edges }]);
 for (const types of [[], ['X'], ['X', 'X'], ['Y'], ['missing']]) {
  const projected = graph.project({ scope: 'a', types });
  try {
   for (const direction of ['out', 'in', 'both']) for (const maxDepth of [0, 1, 2, 4, 10]) for (const id of ['n0', 'n17', 'n79', 'n80', 'missing']) {
    const stored = { id, scope: 'a', direction, maxDepth, types, algorithm: 'bfs' };
    const input = { id, direction, maxDepth };
    const expected = graph.trace(stored);
    for (const algorithm of ['bfs', 'adaptive']) {
     assert.deepEqual(projected.trace({ ...input, algorithm }), expected);
     assert.deepEqual(projected.traceStats({ ...input, algorithm }), graph.traceStats(stored));
     comparisons += 2;
    }
    for (const targetId of ['n0', 'n12', 'n41', 'n80', 'missing', id]) {
     assert.equal(projected.shortestDistance({ ...input, targetId }), graph.shortestDistance({ ...stored, targetId }));
     comparisons++;
    }
   }
  } finally { projected.close(); }
 }
 // SQL collation, multiple types between endpoints, cycles and large hub frontiers.
 const wideNodes = ['start', ...Array.from({ length: 600 }, (_, i) => `wide:${i}`), '😀', '\uE000'].map(id => ({ id, kind: 'Thing', scope: 'wide', title: id }));
 const wideEdges = wideNodes.slice(1).flatMap(n => [{ from: 'start', to: n.id, type: 'X', scope: 'wide' }, { from: n.id, to: 'start', type: 'Y', scope: 'wide' }]);
 graph.rebuild([{ nodes: wideNodes, edges: wideEdges }]);
 const projected = graph.project({ scope: 'wide' });
 const opts = { id: 'wide:599', direction: 'both', maxDepth: 10 };
 assert.deepEqual(projected.trace(opts), graph.trace({ ...opts, scope: 'wide' }));
 assert.equal(projected.shortestDistance({ ...opts, targetId: '😀' }), 2);
 // Altering returned rows and info cannot change a projection's private snapshot.
 projected.trace(opts)[0].title = 'modified';
 projected.info.types.push('injected');
 assert.deepEqual(projected.trace(opts), graph.trace({ ...opts, scope: 'wide' }));
 assert.deepEqual(projected.info.types, []);
 for (const bad of [{ ...opts, scope: 'other' }, { ...opts, types: ['Y'] }, { ...opts, maxDepth: 11 }, { ...opts, algorithm: 'sql' }]) assert.throws(() => projected.traceStats(bad));
 assert.throws(() => projected.shortestDistance(opts));
 graph.rebuild([{ nodes: wideNodes, edges: [] }]);
 assert.equal(projected.shortestDistance({ ...opts, targetId: '😀' }), 2);
 const fresh = graph.project({ scope: 'wide' });
 assert.equal(fresh.shortestDistance({ ...opts, targetId: '😀' }), null);
 fresh.close(); projected.close(); projected.close();
 assert.throws(() => projected.traceStats(opts), /closed/);
 const empty = graph.project({ scope: 'missing' });
 assert.deepEqual(empty.trace({ id: 'none' }), []);
 assert.equal(empty.shortestDistance({ id: 'none', targetId: 'none' }), null);
 empty.close();
 // Scope validation also covers deliberately malformed raw records.
 graph.db.prepare('INSERT INTO items(id,kind,scope) VALUES(?,?,?)').run('outside', 'Thing', 'other');
 graph.db.prepare('INSERT INTO links VALUES(?,?,?,?,?)').run('start', 'outside', 'X', 'wide', '{}');
 graph.db.prepare('INSERT INTO links VALUES(?,?,?,?,?)').run('start', 'missing', 'X', 'wide', '{}');
 graph.db.exec('BEGIN');
 const isolated = graph.project({ scope: 'wide' });
 assert.equal(graph.db.isTransaction, true);
 graph.db.exec('ROLLBACK');
 assert.deepEqual(isolated.trace({ id: 'start' }), []);
 isolated.close();
 // Long directed chain with a high-degree source forces reverse expansion;
 // the ten-hop limit must include distance 10 and exclude distance 11.
 const chainNodes = [...Array.from({ length: 15 }, (_, i) => `c${i}`), ...Array.from({ length: 50 }, (_, i) => `leaf${i}`)].map(id => ({ id, kind: 'Node', scope: 'chain' }));
 const chainEdges = [
  ...Array.from({ length: 14 }, (_, i) => ({ from: `c${i}`, to: `c${i + 1}`, type: 'X', scope: 'chain' })),
  ...Array.from({ length: 50 }, (_, i) => ({ from: 'c0', to: `leaf${i}`, type: 'X', scope: 'chain' })),
 ];
 graph.rebuild([{ nodes: chainNodes, edges: chainEdges }]);
 const chain = graph.project({ scope: 'chain' });
 assert.equal(chain.shortestDistance({ id: 'c0', targetId: 'c10', maxDepth: 9 }), null);
 assert.equal(chain.shortestDistance({ id: 'c0', targetId: 'c10', maxDepth: 10 }), 10);
 assert.equal(chain.shortestDistance({ id: 'c0', targetId: 'c11', maxDepth: 10 }), null);
 assert.equal(chain.shortestDistance({ id: 'c10', targetId: 'c0', direction: 'in' }), 10);
 assert.equal(chain.shortestDistance({ id: 'c10', targetId: 'c0', direction: 'out' }), null);
 assert.deepEqual(chain.traceStats({ id: 'c0', maxDepth: 10 }), { count: 60, depthSum: 105 });
 chain.close();
} finally { graph.close(); }

// Another connection can rebuild the store; old projections remain explicit
// snapshots, fresh projections observe the commit, and snapshots outlive the DB.
const directory = mkdtempSync(join(tmpdir(), 'noderel-projection-'));
try {
 const writer = new NodeRel(join(directory, 'graph.sqlite'));
 const nodes = ['a', 'b'].map(id => ({ id, scope: 's', kind: 'Node' }));
 writer.rebuild([{ nodes, edges: [{ from: 'a', to: 'b', type: 'X', scope: 's' }] }]);
 const reader = new NodeRel(join(directory, 'graph.sqlite'), { readOnly: true });
 const old = reader.project({ scope: 's' });
 writer.rebuild([{ nodes, edges: [] }]);
 const fresh = reader.project({ scope: 's' });
 reader.close(); writer.close();
 assert.equal(old.shortestDistance({ id: 'a', targetId: 'b' }), 1);
 assert.equal(fresh.shortestDistance({ id: 'a', targetId: 'b' }), null);
 old.close(); fresh.close();
} finally { rmSync(directory, { recursive: true, force: true }); }
console.log(`PASS ${comparisons} projection/BFS comparisons, directed dense graphs, scope/Unicode/snapshot lifecycle checks`);
