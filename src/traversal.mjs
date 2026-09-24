// On-demand SQLite adjacency reads: no full-graph preload or result cache.
const readers = new WeakMap();
const BATCH_SIZE = 256;

export function traversalOptions(options = {}) {
 const { id, scope, direction = 'out', maxDepth = 10, types = [] } = options;
 if (typeof id !== 'string' || typeof scope !== 'string') throw new TypeError('id and scope must be strings');
 if (!['out', 'in', 'both'].includes(direction)) throw new Error('direction must be out, in or both');
 if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 10) throw new Error('maxDepth must be 0..10');
 if (!Array.isArray(types) || types.some(type => typeof type !== 'string')) throw new TypeError('types must be an array of strings');
 return { id, scope, direction, maxDepth, types: [...new Set(types)] };
}

function reader(db) {
 if (!readers.has(db)) readers.set(db, {
  exists: db.prepare('SELECT 1 FROM items WHERE id=? AND scope=?'),
  statements: new Map(),
  rows: db.prepare(`SELECT i.id,i.title,i.kind,json_extract(j.value,'$[1]') AS depth
   FROM json_each(?) j JOIN items i ON i.id=json_extract(j.value,'$[0]')
   WHERE i.scope=? ORDER BY depth,i.id`),
 });
 return readers.get(db);
}

function* adjacent(db, frontier, { scope, direction, types }) {
 const { statements } = reader(db);
 const directions = direction === 'both' ? ['out', 'in'] : [direction];
 for (let offset = 0; offset < frontier.length; offset += BATCH_SIZE) {
  const batch = frontier.slice(offset, offset + BATCH_SIZE);
  for (const side of directions) {
   const key = `${side}:${batch.length}:${types.length}`;
   if (!statements.has(key)) {
    const [from, to] = side === 'out' ? ['from_id', 'to_id'] : ['to_id', 'from_id'];
    statements.set(key, db.prepare(`SELECT l.${to} AS id FROM links l
     JOIN items target ON target.id=l.${to} AND target.scope=?
     WHERE l.${from} IN (${batch.map(() => '?').join(',')}) AND l.scope=?
     ${types.length ? `AND l.type IN (${types.map(() => '?').join(',')})` : ''}`));
   }
   // Iterate rather than retain an entire high-degree adjacency batch in JS.
   for (const row of statements.get(key).iterate(scope, ...batch, scope, ...types)) yield row.id;
  }
 }
}

function reachable(db, options) {
 const opts = traversalOptions(options);
 const seen = new Map();
 if (!reader(db).exists.get(opts.id, opts.scope)) return seen;
 seen.set(opts.id, 0);
 let frontier = [opts.id];
 for (let depth = 1; depth <= opts.maxDepth && frontier.length; depth++) {
  const next = [];
  for (const id of adjacent(db, frontier, opts)) {
   if (seen.has(id)) continue;
   seen.set(id, depth);
   next.push(id);
  }
  frontier = next;
 }
 seen.delete(opts.id);
 return seen;
}

// Several statements make one traversal. Pin a consistent SQLite read snapshot,
// preserving an explicit transaction already owned by the caller.
export function readSnapshot(db, operation) {
 const ownsTransaction = !db.isTransaction;
 if (ownsTransaction) db.exec('BEGIN');
 try {
  const value = operation();
  if (ownsTransaction) db.exec('COMMIT');
  return value;
 } catch (error) {
  if (ownsTransaction) db.exec('ROLLBACK');
  throw error;
 }
}

export function traceBfs(db, options) {
 return readSnapshot(db, () => {
  const seen = reachable(db, options);
  return seen.size ? reader(db).rows.all(JSON.stringify([...seen]), options.scope) : [];
 });
}

export function traceStatsBfs(db, options) {
 return readSnapshot(db, () => {
  const seen = reachable(db, options);
  let depthSum = 0;
  for (const depth of seen.values()) depthSum += depth;
  return { count: seen.size, depthSum };
 });
}

export function shortestDistanceBfs(db, options) {
 const opts = traversalOptions(options);
 const { targetId } = options;
 if (typeof targetId !== 'string') throw new TypeError('targetId must be a string');
 return readSnapshot(db, () => {
  const { exists } = reader(db);
  if (!exists.get(opts.id, opts.scope) || !exists.get(targetId, opts.scope)) return null;
  if (opts.id === targetId) return 0;
  const reverse = opts.direction === 'out' ? 'in' : opts.direction === 'in' ? 'out' : 'both';
  let left = [opts.id], right = [targetId], leftDepth = 0, rightDepth = 0;
  const seenLeft = new Map([[opts.id, 0]]), seenRight = new Map([[targetId, 0]]);
  while (left.length && right.length && leftDepth + rightDepth < opts.maxDepth) {
   const forward = left.length <= right.length;
   const own = forward ? seenLeft : seenRight, other = forward ? seenRight : seenLeft;
   const depth = forward ? ++leftDepth : ++rightDepth;
   const frontier = forward ? left : right, next = [];
   let best = Infinity;
   for (const id of adjacent(db, frontier, { ...opts, direction: forward ? opts.direction : reverse })) {
    if (own.has(id)) continue;
    own.set(id, depth);
    next.push(id);
    if (other.has(id)) best = Math.min(best, depth + other.get(id));
   }
   // Finish the entire layer before selecting the shortest meeting distance.
   if (best !== Infinity) return best <= opts.maxDepth ? best : null;
   if (forward) left = next;
   else right = next;
  }
  return null;
 });
}
