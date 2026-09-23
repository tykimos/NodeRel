# Query guide: NodeRel and Cypher

These examples ask the same questions of two different representations. **SQL and JavaScript run in NodeRel. Cypher runs in Neo4j.** NodeRel has no Cypher parser or translator.

Build the committed sample database with `npm run demo:build` from the repository root. For JavaScript examples below, open it once and close it when finished:

```js
import { NodeRel } from './src/noderel.mjs';
const graph = new NodeRel('./examples/neo4j/noderel.sqlite', { readOnly: true });
// Run the examples below, then call graph.close().
```

SQL uses bound `:id` and `:scope` parameters. For example, put a statement in `sql` and call:

```js
const rows = graph.db.prepare(sql).all({
  id: 'movies:Person:Keanu%20Reeves',
  scope: 'movies'
});
```

Cypher examples use the original Movies labels and `name`/`title` fields. The executable comparison cases additionally use `NodeRelItem` and `noderel_id` annotations to align IDs across databases. They are comparison metadata, not requirements for ordinary Neo4j Movies queries.

## 1. Follow one relationship: an actor's films

Question: which movies feature Keanu Reeves?

```js
const movies = graph.trace({
  id: 'movies:Person:Keanu%20Reeves',
  scope: 'movies', direction: 'out', maxDepth: 1, types: ['ACTED_IN']
});
console.log(movies.map(({ title }) => title));
```

Equivalent SQL, with `:id = movies:Person:Keanu%20Reeves` and `:scope = movies`:

```sql
SELECT movie.title
FROM links AS acted
JOIN items AS movie ON movie.id = acted.to_id
WHERE acted.from_id = :id
  AND acted.type = 'ACTED_IN'
  AND acted.scope = :scope
  AND movie.scope = :scope
ORDER BY movie.title;
```

Equivalent Cypher, with `$name = Keanu Reeves`:

```cypher
MATCH (:Person {name: $name})-[:ACTED_IN]->(movie:Movie)
RETURN movie.title AS title
ORDER BY title
```

The sample result is seven titles: *Johnny Mnemonic*, *Something's Gotta Give*, *The Devil's Advocate*, *The Matrix*, *The Matrix Reloaded*, *The Matrix Revolutions*, and *The Replacements*.

## 2. Match a two-step pattern: co-actors

Question: who has acted in a movie with Tom Hanks?

```text
Tom Hanks --ACTED_IN--> Movie <--ACTED_IN-- Other person
```

SQL, with `:id = movies:Person:Tom%20Hanks` and `:scope = movies`:

```sql
SELECT DISTINCT other.title AS name
FROM links AS acted
JOIN links AS shared ON shared.to_id = acted.to_id
JOIN items AS other ON other.id = shared.from_id
WHERE acted.from_id = :id
  AND acted.type = 'ACTED_IN'
  AND shared.type = 'ACTED_IN'
  AND acted.scope = :scope
  AND shared.scope = :scope
  AND other.scope = :scope
  AND other.id <> :id
ORDER BY name;
```

Cypher, with `$name = Tom Hanks`:

```cypher
MATCH (actor:Person {name: $name})-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(other:Person)
WHERE other <> actor
RETURN DISTINCT other.name AS name
ORDER BY name
```

Both return **34 people** in the sample. `DISTINCT` matters because two actors can share more than one movie.

## 3. Read relationship properties: cast and roles

The role belongs to the `ACTED_IN` relationship between a person and a film. In NodeRel, relationship properties are JSON stored in `links.attrs`.

SQL, with `:id = movies:Movie:The%20Matrix` and `:scope = movies`:

```sql
SELECT person.title AS name, json_extract(acted.attrs, '$.roles') AS roles
FROM links AS acted
JOIN items AS person ON person.id = acted.from_id
WHERE acted.to_id = :id
  AND acted.type = 'ACTED_IN'
  AND acted.scope = :scope
  AND person.scope = :scope
ORDER BY name;
```

SQLite returns the JSON array as text here. Decode it with `rows.map(row => ({ ...row, roles: JSON.parse(row.roles) }))`.

Cypher, with `$title = The Matrix`:

```cypher
MATCH (person:Person)-[acted:ACTED_IN]->(:Movie {title: $title})
RETURN person.name AS name, acted.roles AS roles
ORDER BY name
```

The sample returns **five cast members**. Alternatively, `graph.neighbors('movies:Movie:The%20Matrix', 'movies')` returns every incident edge with already-parsed `properties`; it includes other relationship types as well as `ACTED_IN`.

## 4. Find a missing relationship

Question: which people have no outgoing `ACTED_IN` relationship?

```js
const people = graph.orphans({
  scope: 'movies', kind: 'Person', type: 'ACTED_IN', side: 'out'
});
console.log(people.length); // 31
```

```cypher
MATCH (person:Person)
WHERE NOT EXISTS { MATCH (person)-[:ACTED_IN]->() }
RETURN person.name AS title
ORDER BY title
```

The API also returns IDs. “Orphan” is relative to the specified type and direction: these people may still have `DIRECTED`, `PRODUCED`, or other connections.

## 5. Follow multiple hops

Question: what is reachable from customer ALFKI within three outgoing steps?

```text
Customer --PURCHASED--> Order --ORDERS--> Product --PART_OF--> Category
```

```js
const reached = graph.trace({
  id: 'northwind:Customer:ALFKI',
  scope: 'northwind', direction: 'out', maxDepth: 3,
  types: ['PURCHASED', 'ORDERS', 'PART_OF']
});
console.log(reached.length); // 22
```

This returns unique reached orders, products, and categories with their minimum depth. It is a reachability request, not a table containing one row per complete customer–order–product–category path. The `types` filter permits those types at every step; use explicit SQL joins when each position must have a specific type.

For a Movies example, find people and films within four undirected `ACTED_IN` steps of Keanu Reeves:

```js
const neighborhood = graph.trace({
  id: 'movies:Person:Keanu%20Reeves',
  scope: 'movies', direction: 'both', maxDepth: 4, types: ['ACTED_IN']
});
console.log(neighborhood.length); // 57
```

Equivalent Cypher, with `$name = Keanu Reeves`:

```cypher
MATCH path=(start:Person {name: $name})-[:ACTED_IN*1..4]-(node)
WHERE node <> start
RETURN coalesce(node.name, node.title) AS title, min(length(path)) AS depth
ORDER BY depth, title
```

The projections and sort order differ: NodeRel includes IDs and kinds and sorts by depth, then ID. The comparison cases normalize results to IDs and minimum depths before comparing them.

## 6. Derive a bounded shortest distance

Question: how many undirected `ACTED_IN` hops separate Keanu Reeves and Tom Hanks?

```js
const reached = graph.trace({
  id: 'movies:Person:Keanu%20Reeves',
  scope: 'movies', direction: 'both', maxDepth: 10, types: ['ACTED_IN']
});
const target = reached.find(node => node.id === 'movies:Person:Tom%20Hanks');
console.log(target?.depth ?? null); // 4
```

Equivalent Cypher, with `$from = Keanu Reeves` and `$to = Tom Hanks`:

```cypher
MATCH (start:Person {name: $from}), (target:Person {name: $to})
MATCH path=shortestPath((start)-[:ACTED_IN*1..10]-(target))
RETURN length(path) AS depth
```

The NodeRel example computes the bounded reachable set first and then finds the target. It does not stop at that target or return a path. A missing result means no connection was found within the requested depth; it does not prove disconnection at all depths. The separate benchmark implements bidirectional BFS, but `shortest_path` is **not** a public NodeRel operation.

## 7. Read quantities from order relationships

SQL, with `:id = northwind:Order:10248` and `:scope = northwind`:

```sql
SELECT product.title AS product, json_extract(ordered.attrs, '$.quantity') AS quantity
FROM links AS ordered
JOIN items AS product ON product.id = ordered.to_id
WHERE ordered.from_id = :id
  AND ordered.type = 'ORDERS'
  AND ordered.scope = :scope
  AND product.scope = :scope
ORDER BY product;
```

The result contains three product/quantity rows. The exact stored values and matching Cypher are in [case 15](../examples/neo4j/cases.mjs) and [the recorded results](../examples/neo4j/results.json).

## Inspecting the SQL generated by `trace`

```js
const { sql, parameters } = graph.traceQuery({
  id: 'movies:Person:Keanu%20Reeves',
  scope: 'movies', direction: 'out', maxDepth: 1, types: ['ACTED_IN']
});
console.log(sql, parameters);
```

This returns a parameterized recursive query without executing it. A `UNION` removes duplicate `(id, depth)` states, and the final aggregation selects each node's minimum depth. The same node at different depths can still be explored. See [design notes](design.md) for scope and traversal semantics.

## What these examples do not imply

The examples cover a useful subset of relationship queries. They do not implement arbitrary Cypher, complete path enumeration, weighted shortest paths, a general pattern compiler, or automatic natural-language translation. Original node attributes such as `Movie.released` and product prices are not in the current `items` table; querying them requires extending the index or consulting the source snapshots.
