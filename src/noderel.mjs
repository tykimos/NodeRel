import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

export const SCHEMA = `
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS items (
 id TEXT PRIMARY KEY,kind TEXT NOT NULL,scope TEXT NOT NULL DEFAULT '',
 no TEXT NOT NULL DEFAULT '',title TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS items_kind_scope ON items(kind,scope);
CREATE TABLE IF NOT EXISTS links (
 from_id TEXT NOT NULL,to_id TEXT NOT NULL,type TEXT NOT NULL,
 scope TEXT NOT NULL DEFAULT '',attrs TEXT NOT NULL DEFAULT '{}',
 PRIMARY KEY(from_id,to_id,type)
);
CREATE INDEX IF NOT EXISTS links_to ON links(to_id,type);
CREATE INDEX IF NOT EXISTS links_from ON links(from_id,type);
CREATE TABLE IF NOT EXISTS sync_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
`;

// This demonstration implements the supplied three-table design.
// Original node properties stay in the source snapshots, outside the index.
export class NodeRel {
 constructor(file,{readOnly=false}={}) {
  this.db=new DatabaseSync(file,{readOnly});
  if(!readOnly)this.db.exec(SCHEMA);
 }
 rebuild(snapshots) {
  const nodes=snapshots.flatMap(s=>s.nodes),edges=snapshots.flatMap(s=>s.edges);
  const have=new Map();
  for(const n of nodes){if(have.has(n.id))throw new Error(`Duplicate node ID: ${n.id}`);have.set(n.id,n);}
  const accepted=[],rejected=[],tuples=new Set();
  for(const e of edges){
   const key=JSON.stringify([e.from,e.to,e.type]);
   if(tuples.has(key))throw new Error(`Parallel same-type edge unsupported by supplied schema: ${key}`);
   tuples.add(key);
   if(e.from===e.to){rejected.push({...e,reason:'self-reference'});continue;}
   if(!have.has(e.from)||!have.has(e.to)){rejected.push({...e,reason:'missing endpoint'});continue;}
   if(have.get(e.from).scope!==e.scope||have.get(e.to).scope!==e.scope)throw new Error('Cross-scope edge requires an explicit access policy');
   accepted.push(e);
  }
  const insertItem=this.db.prepare('INSERT INTO items VALUES(?,?,?,?,?,?,?)');
  const insertLink=this.db.prepare('INSERT INTO links VALUES(?,?,?,?,?)');
  const meta=this.db.prepare('INSERT OR REPLACE INTO sync_meta VALUES(?,?)');
  this.db.exec('BEGIN IMMEDIATE');
  try {
   this.db.exec('DELETE FROM links; DELETE FROM items; DELETE FROM sync_meta;');
   for(const n of nodes)insertItem.run(n.id,n.kind,n.scope,n.no||'',n.title||'',n.status||'',n.updated_at||'');
   for(const e of accepted)insertLink.run(e.from,e.to,e.type,e.scope,JSON.stringify(e.properties||{}));
   meta.run('signature',createHash('sha256').update(JSON.stringify(snapshots)).digest('hex'));
   meta.run('syncedAt',new Date().toISOString());meta.run('rejected',JSON.stringify(rejected));
   this.db.exec('COMMIT');
  } catch(e){this.db.exec('ROLLBACK');throw e;}
  return {nodes:nodes.length,edges:accepted.length,rejected};
 }
 stats(scope) {
  return {
   kinds:this.db.prepare('SELECT kind,count(*) AS count FROM items WHERE scope=? GROUP BY kind ORDER BY kind').all(scope),
   types:this.db.prepare('SELECT type,count(*) AS count FROM links WHERE scope=? GROUP BY type ORDER BY type').all(scope),
  };
 }
 traceQuery({id,scope,direction='out',maxDepth=10,types=[]}) {
  if(!['out','in','both'].includes(direction))throw new Error('direction must be out, in or both');
  if(!Number.isInteger(maxDepth)||maxDepth<0||maxDepth>10)throw new Error('maxDepth must be 0..10');
  const parameters={id,scope,maxDepth};
  const filter=types.length?` AND type IN (${types.map((t,i)=>{parameters['t'+i]=t;return ':t'+i;}).join(',')})`:'';
  const selected=`FROM links WHERE scope=:scope${filter}`;
  const edges=direction==='out'?`SELECT from_id src,to_id dst ${selected}`:
   direction==='in'?`SELECT to_id src,from_id dst ${selected}`:
   `SELECT from_id src,to_id dst ${selected} UNION SELECT to_id src,from_id dst ${selected}`;
  const sql=`WITH RECURSIVE edge(src,dst) AS (${edges}), walk(id,depth) AS (
   SELECT id,0 FROM items WHERE id=:id AND scope=:scope
   UNION
   SELECT e.dst,w.depth+1 FROM walk w JOIN edge e ON e.src=w.id
   JOIN items target ON target.id=e.dst AND target.scope=:scope
   WHERE w.depth<:maxDepth
  ) SELECT i.id,i.title,i.kind,min(w.depth) AS depth
  FROM walk w JOIN items i ON i.id=w.id
  WHERE w.id<>:id GROUP BY i.id ORDER BY depth,i.id`;
  return {sql,parameters};
 }
 trace(options){const q=this.traceQuery(options);return this.db.prepare(q.sql).all(q.parameters);}
 neighbors(id,scope) {
  return this.db.prepare(`SELECT l.from_id,l.to_id,l.type,l.attrs FROM links l
   JOIN items a ON a.id=l.from_id JOIN items b ON b.id=l.to_id
   WHERE l.scope=? AND a.scope=? AND b.scope=? AND (l.from_id=? OR l.to_id=?)
   ORDER BY l.type,l.from_id,l.to_id`).all(scope,scope,scope,id,id)
   .map(({attrs,...e})=>({...e,properties:JSON.parse(attrs)}));
 }
 orphans({scope,kind,type,side='out'}) {
  if(!['out','in'].includes(side))throw new Error('side must be out or in');
  const endpoint=side==='out'?'from_id':'to_id';
  return this.db.prepare(`SELECT i.id,i.title FROM items i WHERE i.scope=? AND i.kind=?
   AND NOT EXISTS(SELECT 1 FROM links l WHERE l.${endpoint}=i.id AND l.scope=i.scope AND l.type=?) ORDER BY i.id`).all(scope,kind,type);
 }
 graph(scope){return {items:this.db.prepare('SELECT * FROM items WHERE scope=? ORDER BY id').all(scope),links:this.db.prepare('SELECT * FROM links WHERE scope=? ORDER BY from_id,to_id,type').all(scope)};}
 close(){this.db.close();}
}
