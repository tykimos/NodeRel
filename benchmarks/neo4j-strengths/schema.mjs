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
