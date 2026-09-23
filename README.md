# NodeRel

**A small SQLite graph layer with a schema AI tools can inspect.**

NodeRel stores nodes and relationships in a local SQLite file, follows connections, finds missing relationships, and describes the data for AI applications. It is a Node.js prototype for a **derived graph index**: keep the authoritative data in your existing files or systems, and rebuild the graph when you need it.

The core uses Node's built-in SQLite module, requires no database server, and has no external npm dependencies. It includes working Movies and Northwind examples, stored Neo4j reference results, and reproducible performance experiments.

[Visual guide](docs/visual-guide.md) · [Quick start](#quick-start) · [Query examples](#query-examples) · [Neo4j comparison](#noderel-and-neo4j) · [Benchmarks](#measured-performance) · [AI integration](#a-schema-for-ai-generated-queries)

## Why NodeRel?

Many applications already have the data they need, but the connections are difficult to ask about:

- Which tasks depend on a requirement?
- Who worked with this actor?
- Which products did a customer buy, and which categories do they belong to?
- Which items are missing a required relationship?

NodeRel makes those connections explicit without first moving the entire application into a graph database. Here, **index** means a rebuildable representation that helps answer relationship questions. SQLite's own table indexes then help locate individual nodes and edges inside that representation.

The AI idea is simple: a user should be able to ask a question without learning a query language. An AI application can inspect node kinds, relationship directions, example IDs, and available operations, then produce a structured query request. NodeRel supplies that description and a small execution API. **The language model, entity resolution, and application integration are still supplied by the application developer.**

AI can also generate Cypher for Neo4j. NodeRel's distinction is its embedded storage and explicit, compact operation contract; AI does not remove differences in query expressiveness or execution performance.

![Architecture: source snapshots rebuild a SQLite graph; its schema and query API support an application-supplied AI layer.](docs/assets/architecture.png)

[View SVG](docs/assets/architecture.svg)

The snapshot importer, SQLite queries, and schema exporter are implemented. Source adapters and the AI application are integration points; there is no automatic source watcher or natural-language service.

## Quick start

Use **Node.js 24.13.1 or later**. Run these commands from a source checkout; the package is not published on npm.

```sh
git clone https://github.com/tykimos/NodeRel.git
cd NodeRel
npm test
npm run demo:build
npm run demo -- show 1
npm run schema
```

| Command | What it does |
|---|---|
| `npm test` | Builds a temporary database and checks 15 sample queries, boundary behavior, the AI schema, and SQLite integrity. |
| `npm run demo:build` | Rebuilds `examples/neo4j/noderel.sqlite` from the committed snapshots. |
| `npm run demo -- show 1` | Shows the films featuring Keanu Reeves. |
| `npm run demo -- test` | Compares current SQLite results with the stored Neo4j baseline. |
| `npm run schema` | Exports the database description to `examples/ai/schema.json`. |

These commands do not require Neo4j or an npm dependency installation. Node 24.13.1 may print an experimental warning for `node:sqlite`.

## Your first graph

![Inbound traversal: the login requirement reaches its implementing API task at depth one and the dependent UI task at depth two.](docs/assets/inbound-traversal.png)

[View SVG](docs/assets/inbound-traversal.svg)

Run this JavaScript from the repository root, for example with `node --input-type=module`:

```js
import { NodeRel } from './src/noderel.mjs';

const graph = new NodeRel(':memory:');
try {
  graph.rebuild([{
    nodes: [
      { id: 'req:login', kind: 'Requirement', scope: 'app', title: 'User login' },
      { id: 'task:api', kind: 'Task', scope: 'app', title: 'Build login API' },
      { id: 'task:ui', kind: 'Task', scope: 'app', title: 'Build login screen' }
    ],
    edges: [
      { from: 'task:api', to: 'req:login', type: 'IMPLEMENTS', scope: 'app' },
      { from: 'task:ui', to: 'task:api', type: 'DEPENDS_ON', scope: 'app' }
    ]
  }]);

  const affected = graph.trace({
    id: 'req:login',
    scope: 'app',
    direction: 'in',
    maxDepth: 2,
    types: ['IMPLEMENTS', 'DEPENDS_ON']
  });
  console.log(affected.map(({ title, depth }) => ({ title, depth })));
  // [ { title: 'Build login API', depth: 1 },
  //   { title: 'Build login screen', depth: 2 } ]
} finally {
  graph.close();
}
```

`in` follows incoming relationships, so the query starts at the requirement and reaches the tasks pointing toward it. The `types` list allows either relationship type at every step; it does not enforce a different type at each depth.

## Query examples

![Movies connects people to films through ACTED_IN with role properties. Northwind connects customers, orders, products, categories, and suppliers.](docs/assets/example-graphs.png)

[View SVG](docs/assets/example-graphs.svg)

The Movies panel shows two actual cast relationships. The Northwind panel shows a type-level pattern used by the query examples below.

### Which movies feature Keanu Reeves?

After `npm run demo:build`, run from the repository root:

```js
import { NodeRel } from './src/noderel.mjs';

const graph = new NodeRel('./examples/neo4j/noderel.sqlite', { readOnly: true });
try {
  const movies = graph.trace({
    id: 'movies:Person:Keanu%20Reeves',
    scope: 'movies',
    direction: 'out',
    maxDepth: 1,
    types: ['ACTED_IN']
  });
  console.log(movies.map(movie => movie.title));
} finally {
  graph.close();
}
```

The sample returns seven films, including *The Matrix*, *The Matrix Reloaded*, and *The Matrix Revolutions*. The full result is in the [verified tool-call example](examples/ai/example.json).

The equivalent question in the original Neo4j Movies model is:

```cypher
MATCH (:Person {name: $name})-[:ACTED_IN]->(movie:Movie)
RETURN movie.title AS title
ORDER BY title
```

Bind `$name` to `Keanu Reeves`. **NodeRel does not execute Cypher**; its public interface is JavaScript functions and SQLite SQL.

### Who has acted with Tom Hanks?

A typed two-step pattern can be expressed with parameterized SQL. Here, both relationships point from a person to a shared movie:

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

Bind `:id` to `movies:Person:Tom%20Hanks` and `:scope` to `movies`. This returns **34 distinct people** in the committed sample. Execute parameterized statements through `graph.db.prepare(sql).all({ id, scope })`.

The corresponding Cypher pattern is:

```cypher
MATCH (actor:Person {name: $name})-[:ACTED_IN]->(:Movie)<-[:ACTED_IN]-(other:Person)
WHERE other <> actor
RETURN DISTINCT other.name AS name
ORDER BY name
```

See the [query guide](docs/queries.md) for relationship properties, missing relationships, multi-hop traversal, shortest distance, and expected outputs. The repository contains [15 executable SQL/API–Cypher examples](examples/neo4j/cases.mjs).

## A schema for AI-generated queries

![Proposed sequence: the application gets a schema, resolves IDs, asks a model for a request, validates it, queries NodeRel, and supplies the result for an answer.](docs/assets/ai-query-sequence.png)

[View SVG](docs/assets/ai-query-sequence.svg)

This sequence shows how an application can integrate NodeRel. The model, resolver, and validation layer are application responsibilities; the schema exporter and graph operations are implemented here.

```js
import { describeNodeRel } from './src/describe.mjs';

const schema = describeNodeRel('./examples/neo4j/noderel.sqlite');
console.log(schema.scopes);
console.log(schema.existingOperations);
```

The exporter reads the actual database and describes:

- Node kinds, counts, example IDs, and populated node columns.
- Observed relationships such as `Person → ACTED_IN → Movie`.
- Relationship property names and JSON types, such as the `roles` array.
- Existing operations, including a JSON Schema input contract for `trace`.
- A source signature for identifying the imported snapshot.

An application can provide the relevant description to an AI model, resolve the user's entity to a real ID, and have the model propose a request like this:

```json
{
  "tool": "trace",
  "arguments": {
    "id": "movies:Person:Keanu%20Reeves",
    "scope": "movies",
    "direction": "out",
    "maxDepth": 1,
    "types": ["ACTED_IN"]
  }
}
```

The application validates the operation, scope, arguments, and execution budget, then calls `graph.trace(request.arguments)`. The repository verifies this request's result; it does **not** measure a model's ability to translate natural language.

Observed relationship shapes are descriptions of the snapshot, not enforced domain rules. Business meanings in the sample schema are curated. Generic name/alias resolution, complete request validation, time budgets, and an MCP/HTTP service are not implemented. See the [AI integration guide](examples/ai/README.md).

## NodeRel and Neo4j

![Execution models: NodeRel calls built-in SQLite inside Node.js, while a Neo4j driver sends Cypher over Bolt to a separate database server.](docs/assets/execution-models.png)

[View SVG](docs/assets/execution-models.svg)

| Dimension | NodeRel today | Neo4j in this comparison |
|---|---|---|
| Deployment | SQLite inside a Node.js process; local file | A separate Community database server, queried over Bolt |
| Query interface | Small JavaScript API and SQL | Cypher graph patterns, paths, and aggregations |
| Data model | One `kind` per node; fixed node columns; JSON edge properties | Labeled nodes and typed relationships with properties |
| Graph traversal | Public `trace()` uses recursive SQL | Graph operators chosen by the query planner |
| Shortest distance | Can derive from bounded `trace()`; specialized BFS exists only in the benchmark | Expressed directly with `shortestPath` in the tested queries |
| AI integration | Actual schema and operation descriptions are exported | AI can generate Cypher using the application's schema/context |
| Concurrency tested | Independent SQLite read connections in worker threads | Independent Bolt sessions |
| Natural fit | Rebuildable local relationship views over existing data | Applications centered on varied graph queries and shared graph access |

Neo4j's advantage includes the ability to express graph work declaratively and let its execution planner choose graph operators. In the recorded plans, shortest-path and broad-reach queries use `ShortestPath` and `VarLengthExpand(Pruning,BFS,All)`. Building comparable specialized SQLite traversals required extra application code. See the [recorded plans](benchmarks/neo4j-strengths/query-plans.json) and [Neo4j shortest-path documentation](https://neo4j.com/docs/cypher-manual/25/patterns/shortest-paths/).

SQLite supports concurrent readers; it is not limited to one reader. Its embedded architecture and single-writer behavior serve different workloads from a database server. See [SQLite's guidance on suitable uses](https://www.sqlite.org/whentouse.html).

## Measured performance

These charts use the **recorded September 23, 2026 experiment**, not new measurements made while writing this README. The graph has **50,000 nodes and 300,000 directed edges**. Three implementations are kept separate:

1. **SQLite recursive SQL:** the bounded `(id, depth)` CTE approach adapted for benchmark outputs. This is related to the public `trace()` implementation, but the measurements are not direct timings of that API.
2. **SQLite + custom BFS:** separate, benchmark-only JavaScript breadth-first search, including bidirectional search for shortest distance. It queries SQLite indexes as it explores; it is **not integrated into NodeRel's public API**. Single-node lookup uses direct SQL.
3. **Neo4j over Bolt:** Cypher executed through a reused local driver/session, including transport and result handling.

### Query latency

![Median query latency on a logarithmic scale. Custom SQLite BFS is faster for small traversals; Neo4j is faster for broad six-hop reachability.](docs/assets/query-latency.png)

[View SVG](docs/assets/query-latency.svg)

Median milliseconds; lower is better. A dash means that separate implementation was not measured.

| Workload | SQLite recursive SQL | SQLite + custom BFS* | Neo4j Bolt |
|---|---:|---:|---:|
| Single node lookup | — | 0.006 | 0.276 |
| Shortest distance, up to 10 hops | 1,709.006 | 1.530 | 1.919 |
| Shortest distance avoiding inactive nodes | 1,291.534 | 1.903 | 1.984 |
| Reachability within 3 hops | 0.535 | 0.194 | 1.043 |
| Reachability within 6 hops | 98.085 | 25.846 | 13.592 |

\* Benchmark-only traversal code; point lookup is direct SQL. Reachability returns a count and the sum of minimum depths, rather than every reached node.

Neo4j was about **1.9× faster than custom SQLite BFS** on six-hop reachability, which reached roughly 32,000 nodes per source. SQLite had lower latency for small local reads. The large shortest-distance gap against the CTE reflects different algorithms: the CTE explores the bounded reachable graph, whereas bidirectional BFS can stop early. It is not evidence of a universal database-engine speed ratio.

### Concurrent traversal

![Six-hop traversal throughput with 1, 4, and 8 concurrent clients, plus an eight-client repeat with reversed measurement order.](docs/assets/concurrent-throughput.png)

[View SVG](docs/assets/concurrent-throughput.svg)

Completed requests per second; higher is better. Each client sends its next request after the previous one finishes.

| Run | Clients | SQLite + custom BFS | Neo4j Bolt | Neo4j / SQLite |
|---|---:|---:|---:|---:|
| Primary | 1 | 35.4 | 80.8 | 2.28× |
| Primary | 4 | 78.0 | 188.2 | 2.41× |
| Primary | 8 | 67.4 | 225.5 | 3.34× |
| Reversed-order repeat | 8 | 105.0 | 325.9 | 3.10× |

Neo4j delivered **3.1–3.3× the throughput** at eight concurrent clients in these short runs. Absolute rates changed in the repeat, so the results do not establish sustained production capacity.

### How to read the numbers

- **Hardware/software:** Apple M3, 24 GiB RAM, Node 24.13.1, SQLite 3.51.2, Neo4j Community 2025.06.2, driver 5.28.3.
- **Warm cache, local machine:** SQLite runs in process; Neo4j includes a local Bolt round trip. These are client-observed timings, not isolated engine timings. Startup and import are excluded.
- **Memory:** Neo4j uses a 1 GiB heap plus 1 GiB page cache; SQLite allows 64 MiB cache per connection for an approximately 43 MiB file. Memory budgets were not equalized.
- **Samples:** 120 point lookups, 12 pairs for each shortest-distance workload, and 24 sources for each reachability workload. Concurrent conditions ran for approximately six seconds each.
- **Correctness:** 7,529 result checks across the primary run and repeat, using fixed expected values for simple reads and an independent in-memory BFS for graph searches. Complete node/depth sets were also compared for three sources. Reference computation is excluded from timings.
- **Scope:** one synthetic graph, read-only workloads, no cold-cache, concurrent-write, high-availability, or GDS evaluation. Graph shape and query design matter as much as hop count.

The [full benchmark report](benchmarks/neo4j-strengths/REPORT.md) includes p95 latency, methodology, Cypher, interpretation, and limitations. Use the [reproduction instructions](benchmarks/neo4j-strengths/README.md) and [raw results](benchmarks/neo4j-strengths/results.json) to inspect or rerun the experiment.

## API at a glance

| API | Result / purpose |
|---|---|
| `new NodeRel(file, { readOnly })` | Opens a file or `:memory:` database. Writable mode initializes the tables. |
| `rebuild(snapshots)` | Replaces the index transactionally; returns node/edge counts and rejected edges. |
| `trace({ id, scope, direction, maxDepth, types })` | Returns unique reached nodes with `id`, `title`, `kind`, and minimum `depth`. |
| `traceQuery(options)` | Returns the generated SQL and bound parameters without executing it. |
| `neighbors(id, scope)` | Returns incident incoming/outgoing edges with parsed JSON properties. |
| `orphans({ scope, kind, type, side })` | Finds nodes without a specified incoming or outgoing relationship. |
| `stats(scope)` | Counts node kinds and relationship types. |
| `graph(scope)` | Returns all stored nodes and edges in a scope; edge `attrs` remains JSON text. |
| `close()` | Closes the SQLite connection. |
| `describeNodeRel(file)` | Exports schema observations and operation descriptions from a read-only connection. |

`trace()` defaults to `direction: 'out'`, `maxDepth: 10`, and all relationship types. Directions are `out`, `in`, or `both`; depth must be an integer from 0 to 10. The start node is excluded. Results contain minimum hop counts, **not complete paths**. A missing or out-of-scope start returns no reached nodes.

## Storage and current boundaries

![Storage model: links.from_id and links.to_id refer to items.id; sync_meta records the snapshot signature, rebuild time, and rejected edges.](docs/assets/storage-model.png)

[View SVG](docs/assets/storage-model.svg)

The connectors show logical references checked during import. They are not SQL foreign-key constraints.

| Table | Contents |
|---|---|
| `items` | `id`, `kind`, `scope`, `no`, `title`, `status`, `updated_at` |
| `links` | `from_id`, `to_id`, `type`, `scope`, JSON `attrs` |
| `sync_meta` | Snapshot SHA-256, rebuild timestamp, rejected edges |

A rebuild requires globally unique node IDs and at most one edge for each `(from, to, type)` tuple. It rejects cross-scope edges with an error, records self-links and missing-endpoint edges as excluded, and rolls back if writing fails. Different relationship types between the same endpoints are supported.

The index does not store every original node property: birth dates, release years, and product prices remain in the sample snapshots. Multiple node labels and same-type parallel relationships require a model extension. Synchronization is manual. `scope` filtering does not implement authentication or authorization, and the raw `.db` handle has no application policy layer.

`DatabaseSync` blocks its calling thread. Depth limits also do not guarantee a small amount of work: a shallow, highly connected graph may be expensive. Worker placement, execution budgets, and service-level controls belong in the integrating application. See [design and semantics](docs/design.md).

## Example coverage

| Official dataset | Nodes | Relationships |
|---|---:|---:|
| Movies | 171 | 253 |
| Northwind | 1,035 | 3,139 |
| **Total** | **1,206** | **3,392** |

Fifteen queries cover one-hop lookups, co-actors, relationship properties, joins, aggregation, missing relationships, reachability, and minimum distance. Current tests compare SQLite output with results previously recorded from Neo4j; **they do not query a live Neo4j server**. The earlier small-sample timings used HTTP and are kept separate from the Bolt charts above.

[Sample instructions](examples/neo4j/README.md) · [Correctness report](examples/neo4j/REPORT.md) · [Data sources and checksums](examples/neo4j/sources.json)

## Repository map

```text
src/                         Core graph API and schema exporter
examples/neo4j/               Snapshots, runnable queries, stored reference results
examples/ai/                  AI-readable schema and verified request example
benchmarks/neo4j-strengths/   Synthetic dataset benchmark and recorded measurements
docs/                        Query guide, design notes, charts, and diagrams
scripts/                     Tests and reproducible visual renderers
```

All chart and diagram labels use English. PNG images are embedded directly in the documentation, with matching SVG files for scaling and editing. The [visual guide](docs/visual-guide.md) lists every asset and explains the diagram conventions.

To regenerate the charts from recorded measurements and rebuild the diagrams, install the optional Python plotting dependency in a virtual environment:

```sh
python3 -m venv /tmp/noderel-charts
/tmp/noderel-charts/bin/python -m pip install -r scripts/requirements-charts.txt
/tmp/noderel-charts/bin/python scripts/render-benchmarks.py
/tmp/noderel-charts/bin/python scripts/render-diagrams.py
```

These commands redraw the visuals; they do not rerun the database benchmarks. Python and Matplotlib are not required to use NodeRel itself.

## License and attribution

This repository is a prototype with **no open-source license granted for its own code** (`UNLICENSED` in `package.json`). The official Movies and Northwind data retain their respective terms. See [third-party notices](THIRD_PARTY_NOTICES.md).
