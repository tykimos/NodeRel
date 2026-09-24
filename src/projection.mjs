import { readSnapshot, traversalOptions } from './traversal.mjs';

// A fixed SQLite read snapshot compiled into integer-indexed adjacency arrays.
// Queries cache no answers and do not consult SQLite after projection creation.
export function createProjection(db, { scope, types = [] } = {}) {
 const options = traversalOptions({ id: '', scope, types });
 return readSnapshot(db, () => {
  // Numeric order also preserves SQLite's ordering for arbitrary Unicode IDs.
  const nodes = db.prepare('SELECT id,title,kind FROM items WHERE scope=? ORDER BY id').all(scope);
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const filter = options.types.length ? ` AND type IN (${options.types.map(() => '?').join(',')})` : '';
  const args = [scope, ...options.types];
  const capacity = db.prepare(`SELECT count(*) AS n FROM links WHERE scope=?${filter}`).get(...args).n;
  if (nodes.length >= 0xffffffff || capacity > 0x7fffffff) throw new RangeError('Projection exceeds 32-bit adjacency capacity');
  const from = new Uint32Array(capacity), to = new Uint32Array(capacity);
  let edges = 0;
  for (const row of db.prepare(`SELECT from_id,to_id FROM links WHERE scope=?${filter}`).iterate(...args)) {
   const a = index.get(row.from_id), b = index.get(row.to_id);
   // Also reject dangling/cross-scope links inserted through the raw DB handle.
   if (a === undefined || b === undefined) continue;
   from[edges] = a; to[edges++] = b;
  }
  const out = csr(nodes.length, from, to, edges);
  const incoming = csr(nodes.length, to, from, edges);
  const both = csr(nodes.length, from, to, edges, true);
  return new GraphProjection({ nodes, index, out, in: incoming, both }, {
   scope, types: options.types, nodes: nodes.length, relationships: edges,
   createdAt: new Date().toISOString(),
   sourceSignature: db.prepare("SELECT value FROM sync_meta WHERE key='signature'").get()?.value ?? null,
   adjacencyBytes: [out, incoming, both].reduce((n, x) => n + x.offsets.byteLength + x.neighbors.byteLength, 0),
   workspaceBytes: nodes.length * 18,
  });
 });
}

function csr(n, from, to, count, undirected = false) {
 const offsets = new Uint32Array(n + 1);
 for (let i = 0; i < count; i++) {
  offsets[from[i] + 1]++;
  if (undirected) offsets[to[i] + 1]++;
 }
 for (let i = 1; i <= n; i++) offsets[i] += offsets[i - 1];
 const next = offsets.slice(0, n), neighbors = new Uint32Array(offsets[n]);
 for (let i = 0; i < count; i++) {
  neighbors[next[from[i]]++] = to[i];
  if (undirected) neighbors[next[to[i]]++] = from[i];
 }
 return { offsets, neighbors };
}

function options(input, shortest = false) {
 if (!input || typeof input !== 'object') throw new TypeError('Query options are required');
 const allowed = shortest ? ['id', 'targetId', 'direction', 'maxDepth'] : ['id', 'direction', 'maxDepth', 'algorithm'];
 for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new Error(`Unknown projection query option: ${key}; scope/types are fixed at creation`);
 const opts = traversalOptions({ ...input, scope: '' });
 if (shortest) {
  if (typeof input.targetId !== 'string') throw new TypeError('targetId must be a string');
  return { ...opts, targetId: input.targetId };
 }
 const algorithm = input.algorithm ?? 'adaptive';
 if (!['bfs', 'adaptive'].includes(algorithm)) throw new Error('Projection algorithm must be bfs or adaptive');
 return { ...opts, algorithm };
}

class GraphProjection {
 #data; #info; #seen; #otherSeen; #depth; #otherDepth; #queue; #otherQueue; #epoch = 0;
 constructor(data, info) {
  this.#data = data; this.#info = info;
  this.#seen = new Uint32Array(info.nodes); this.#otherSeen = new Uint32Array(info.nodes);
  this.#depth = new Uint8Array(info.nodes); this.#otherDepth = new Uint8Array(info.nodes);
  this.#queue = new Uint32Array(info.nodes); this.#otherQueue = new Uint32Array(info.nodes);
 }
 get info() { return { ...this.#info, types: [...this.#info.types] }; }
 #ready() { if (!this.#data) throw new Error('Projection is closed'); }
 #nextEpoch() {
  this.#epoch = (this.#epoch + 1) >>> 0;
  if (!this.#epoch) { this.#seen.fill(0); this.#otherSeen.fill(0); this.#epoch = 1; }
  return this.#epoch;
 }
 #walk(input) {
  this.#ready();
  const { id, direction, maxDepth, algorithm } = options(input);
  const source = this.#data.index.get(id);
  if (source === undefined || !maxDepth) return { count: 0, depthSum: 0 };
  const { offsets, neighbors } = this.#data[direction];
  const reverse = this.#data[direction === 'out' ? 'in' : direction === 'in' ? 'out' : 'both'];
  const seen = this.#seen, depths = this.#depth, queue = this.#queue, epoch = this.#nextEpoch();
  const n = seen.length;
  seen[source] = epoch; depths[source] = 0; queue[0] = source;
  let start = 0, end = 1, tail = 1, depthSum = 0;
  let frontierEdges = offsets[source + 1] - offsets[source], remainingEdges = neighbors.length - frontierEdges;
  for (let depth = 1; depth <= maxDepth && start < end; depth++) {
   let nextEdges = 0;
   // Estimate work, not only frontier size. Bottom-up searches unvisited nodes
   // for a predecessor in this exact layer, avoiding repeated hub-edge scans.
   const bottomUp = algorithm === 'adaptive' && frontierEdges > n + remainingEdges;
   if (bottomUp) {
    for (let node = 0; node < n; node++) {
     if (seen[node] === epoch) continue;
     for (let j = reverse.offsets[node]; j < reverse.offsets[node + 1]; j++) {
      const parent = reverse.neighbors[j];
      if (seen[parent] !== epoch || depths[parent] !== depth - 1) continue;
      seen[node] = epoch; depths[node] = depth; queue[tail++] = node;
      nextEdges += offsets[node + 1] - offsets[node];
      break;
     }
    }
   } else {
    for (let i = start; i < end; i++) {
     const node = queue[i];
     for (let j = offsets[node]; j < offsets[node + 1]; j++) {
      const next = neighbors[j];
      if (seen[next] === epoch) continue;
      seen[next] = epoch; depths[next] = depth; queue[tail++] = next;
      nextEdges += offsets[next + 1] - offsets[next];
     }
    }
   }
   depthSum += (tail - end) * depth;
   start = end; end = tail; frontierEdges = nextEdges; remainingEdges -= nextEdges;
  }
  return { count: tail - 1, depthSum };
 }
 traceStats(input) { return this.#walk(input); }
 trace(input) {
  const { count } = this.#walk(input);
  const indices = Array.from(this.#queue.subarray(1, count + 1));
  indices.sort((a, b) => this.#depth[a] - this.#depth[b] || a - b);
  return indices.map(i => Object.assign(Object.create(null), this.#data.nodes[i], { depth: this.#depth[i] }));
 }
 shortestDistance(input) {
  this.#ready();
  const { id, targetId, direction, maxDepth } = options(input, true);
  const source = this.#data.index.get(id), target = this.#data.index.get(targetId);
  if (source === undefined || target === undefined) return null;
  if (source === target) return 0;
  const forward = this.#data[direction];
  const reverse = this.#data[direction === 'out' ? 'in' : direction === 'in' ? 'out' : 'both'];
  const epoch = this.#nextEpoch();
  const left = { graph: forward, seen: this.#seen, depths: this.#depth, queue: this.#queue, start: 0, end: 1, depth: 0, work: forward.offsets[source + 1] - forward.offsets[source] };
  const right = { graph: reverse, seen: this.#otherSeen, depths: this.#otherDepth, queue: this.#otherQueue, start: 0, end: 1, depth: 0, work: reverse.offsets[target + 1] - reverse.offsets[target] };
  left.queue[0] = source; right.queue[0] = target;
  left.seen[source] = epoch; right.seen[target] = epoch;
  left.depths[source] = 0; right.depths[target] = 0;
  while (left.start < left.end && right.start < right.end && left.depth + right.depth < maxDepth) {
   // Expand the side with fewer incident edges, not merely fewer nodes.
   const side = left.work <= right.work ? left : right, other = side === left ? right : left;
   const { offsets, neighbors } = side.graph;
   const depth = ++side.depth;
   let tail = side.end, nextWork = 0, best = Infinity;
   for (let i = side.start; i < side.end; i++) {
    const node = side.queue[i];
    for (let j = offsets[node]; j < offsets[node + 1]; j++) {
     const next = neighbors[j];
     if (side.seen[next] === epoch) continue;
     side.seen[next] = epoch; side.depths[next] = depth; side.queue[tail++] = next;
     nextWork += offsets[next + 1] - offsets[next];
     if (other.seen[next] === epoch) best = Math.min(best, depth + other.depths[next]);
    }
   }
   if (best !== Infinity) return best <= maxDepth ? best : null;
   side.start = side.end; side.end = tail; side.work = nextWork;
  }
  return null;
 }
 close() {
  this.#data = this.#seen = this.#otherSeen = this.#depth = this.#otherDepth = this.#queue = this.#otherQueue = null;
 }
}
