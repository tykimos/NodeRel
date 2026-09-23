# NodeRel

**Understand your data by following its connections.**

NodeRel is a small software library that helps applications keep track of things and how they are related. It can find the films featuring an actor, the products connected to a customer's orders, or the tasks that depend on a requirement.

You provide the items and their connections. NodeRel stores them in a local database file and gives your application ways to follow those connections and ask questions. It can also describe the data to an AI application.

[Start here](#new-to-graphs-start-here) · [Visual guide](docs/visual-guide.md) · [Quick start](#quick-start) · [Query examples](#query-examples) · [Neo4j comparison](#noderel-and-neo4j) · [Benchmarks](#measured-performance) · [AI integration](#a-schema-for-ai-generated-queries) · [Ontology](#noderel-ontology-v1)

## New to graphs? Start here

### Start with one everyday fact

**Keanu Reeves acted in The Matrix.** You can represent that sentence as two things connected by a named arrow:

![A beginner's graph: the person Keanu Reeves points to the movie The Matrix through ACTED_IN. The relationship has a roles property containing Neo.](docs/assets/graph-basics.png)

[View SVG](docs/assets/graph-basics.svg)

In this README, a **graph** is a map of connected things. Each box represents a thing, and each arrow explains a relationship between two things. Three words are enough to read the picture:

| Graph word | Everyday meaning | Example in the picture |
|---|---|---|
| **Node** | A thing you want to keep track of | The person Keanu Reeves or the movie The Matrix |
| **Relationship** (also called an **edge**) | A named connection between two things | Keanu Reeves `ACTED_IN` The Matrix |
| **Property** | A detail about a thing or a connection | The movie's title, or Keanu's role, Neo, in this particular film |

A person can appear in many movies and play a different role in each one. That is why the role belongs to the connection between the person and the movie. The arrow also gives the fact a direction: **person → acted in → movie**. These are the basic building blocks of the property graph model described in [Neo4j's introductory guide](https://neo4j.com/docs/getting-started/appendix/graphdb-concepts/).

### Follow the connections to answer a question

Add another fact: **Laurence Fishburne acted in The Matrix.** Now the two people share a connection through the same film.

| Question | How the graph helps |
|---|---|
| Which films feature Keanu Reeves? | Start at Keanu and follow his `ACTED_IN` arrows to films. |
| Who acted in The Matrix? | Start at the film and follow the incoming `ACTED_IN` arrows back to people. |
| Who has acted with Keanu Reeves? | Find his films, then find other people connected to those same films. |

Following connections is called **traversal**. Crossing one connection is one **hop**. Going from Keanu to The Matrix to Laurence takes two hops, with the second hop going against the stored arrow. NodeRel supports following outgoing arrows, incoming arrows, or both.

The two facts above are selected cast relationships from the included Movies dataset. That dataset contains more films and cast members. You can express the questions through NodeRel functions or SQL; the [query examples](#query-examples) show how.

### Graphs, graph databases, and knowledge graphs

These terms describe different parts of the idea:

| Term | Plain-language explanation |
|---|---|
| **Graph** | The connected information itself: things and their relationships. |
| **Graph database** | Software designed to store connected information and answer questions about it. Neo4j is one example. |
| **Knowledge graph** | A way to organize knowledge about real things or concepts using relationships with explicit meaning, such as a person acting in a film or a product belonging to a category. |
| **NodeRel** | This project's small library for storing and querying a graph using SQLite, a database engine that runs inside an application. |

A knowledge graph describes **what the information means**; a database provides **a way to store and query it**. The meaning comes from identifying the things and defining what their connections represent. See [Neo4j's explanation of knowledge graphs and graph databases](https://neo4j.com/blog/knowledge-graph/knowledge-graph-vs-graph-database/).

NodeRel can represent a small knowledge graph when you supply those things and meaningful relationships. For example, you can connect documents to the topics they mention or products to their categories. You define those connections; NodeRel does not automatically read arbitrary documents, discover facts, or decide what is true.

### An ontology gives the vocabulary a shared meaning

An **ontology** records the concepts your application uses and how they relate. The fact “Keanu Reeves acted in The Matrix” is data; the definitions “a movie is a kind of creative work” and “acting connects a person to a movie” are vocabulary knowledge.

**NodeRel Ontology v1** is this project's simplified JSON format for writing that vocabulary. It separates concept definitions, relationship meanings, and optional data checks. It is a custom format, with examples and a specification; the current query engine does not load or enforce it automatically. See the [ontology section](#noderel-ontology-v1) for its status and scope.

### What you can use NodeRel for

The same idea works beyond movies:

| Information you already have | Connections you could record | Questions your application could answer |
|---|---|---|
| Requirements and project tasks | A task implements a requirement; another task depends on it | Which tasks are connected to a requirement that changed? |
| Customers, orders, and products | A customer places an order; the order contains products | Which products and categories has this customer purchased? |
| Documents and topics | A document mentions a topic or refers to another document | Which documents are connected to this topic? |

The repository includes working movie and purchase examples, plus a small requirement/task example. A document graph would require your own data preparation. A list or spreadsheet can also store these facts; the graph representation makes their connections explicit and gives the application a consistent way to follow them.

### Where NodeRel fits in your application

A typical workflow has four steps:

1. **Keep your original data.** Files or existing systems remain the source you maintain.
2. **Describe the connections.** Prepare a list of items and a list of named relationships between them.
3. **Build a local graph file.** NodeRel stores those lists in SQLite so they can be queried together.
4. **Ask about related items.** Your application calls NodeRel to find neighbors, follow several connections, or find items missing a particular relationship.

We call the local graph a **derived index** because it is an extra representation made from your source data and can be rebuilt. The word **index** here means a structure that helps look things up. In NodeRel, it helps look up connections.

NodeRel is currently a developer toolkit. A developer prepares the data and connects the library to an application; you do not need to understand its code to understand the examples above. Its diagrams illustrate the concepts, and an interactive graph editor is not included.

For an AI interface, NodeRel can export a **schema**: a description of the kinds of items, the available relationships, and the supported queries. An AI application can use that description to propose a query for a user's question. The developer still supplies the AI model and checks the request before execution. A built-in chat assistant is not included.

Under the hood, this prototype uses Node.js and SQLite. It runs without a separate database server, and its core has no external npm dependencies. Neo4j is a dedicated graph database with a broader graph query interface; the [comparison](#noderel-and-neo4j) explains the differences, including workloads where Neo4j performed better.

Continue with the [quick start](#quick-start), or read the [first graph example](#your-first-graph) to see how a requirement connects to its tasks.

## Why NodeRel?

Many applications already have the data they need, but the connections are difficult to ask about:

- Which tasks depend on a requirement?
- Who worked with this actor?
- Which products did a customer buy, and which categories do they belong to?
- Which items are missing a required relationship?

NodeRel makes those connections explicit without first moving the entire application into a graph database. The derived graph can be rebuilt from your source data. SQLite's own table indexes help locate individual nodes and edges inside it.

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

## NodeRel Ontology v1

**A small, authored vocabulary for the graph.** The draft format has three parts:

| Part | Purpose | Example |
|---|---|---|
| `concepts` | Define the kinds of things and an optional single-parent hierarchy | `Movie` is a kind of `CreativeWork`. |
| `relations` | Explain connections, expected endpoints, and relationship properties | `ACTED_IN` connects a `Person` to a `Movie`. |
| `constraints` | Specify optional data checks separately from meanings | `roles` must be a present array of strings. |

For example, the [complete Movies definition](ontologies/movies.json) includes these concept and relation definitions:

```json
{
  "concepts": {
    "Movie": {
      "description": "A motion picture represented in the dataset.",
      "parent": "CreativeWork"
    }
  },
  "relations": {
    "ACTED_IN": {
      "description": "A person performed in a movie.",
      "from": "Person",
      "to": "Movie",
      "reverseLabel": "has cast member"
    }
  }
}
```

This is an excerpt, not a complete ontology file. Complete files also declare the referenced concepts, scope, format identifier, profile ID, and version. `reverseLabel` is readable wording for the same relationship viewed backward; it does not create another edge type.

The ontology states **declared meaning**. The existing schema exporter reports **observed data**. Keeping them separate lets an application identify discrepancies and give an AI model both business context and actual storage facts.

**Current status:** the specification, JSON Schema, and Movies/Northwind examples are available. Loading these definitions into `describeNodeRel()`, enforcing them during import, and expanding queries through parent concepts are not implemented. Existing query behavior is unchanged.

The vocabulary is **NodeRel-specific** and makes no OWL, SHACL, or JSON-LD conformance claim. Its document structure is described by **JSON Schema Draft 2020-12**; that does not provide graph validation or reasoning by itself.

[Full specification](docs/ontology.md) · [Example files and structural validation](ontologies/README.md) · [Northwind definition](ontologies/northwind.json)

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
ontologies/                   Custom ontology specification schema and examples
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
