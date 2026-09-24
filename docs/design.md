# Design and semantics

## A derived index over authoritative source data

![Source snapshots, a rebuildable SQLite index, a schema exporter, and application integration.](assets/architecture.png)

[View SVG](assets/architecture.svg)

NodeRel's input is an array of snapshots, each containing `nodes` and `edges`. An adapter can create these from files, application records, or another database. NodeRel does not currently supply general-purpose adapters or monitor the sources for changes.

The source remains authoritative. The SQLite file is a derived view that can be rebuilt. This makes a local relationship layer useful even when an application does not need a separate graph server.

`rebuild()` validates duplicate IDs and duplicate `(from, to, type)` relationships before replacing the tables in a transaction. Self-references and edges with missing endpoints are excluded and recorded. An accepted edge and both endpoints must share a scope. An insertion failure rolls the transaction back.

`sync_meta` stores the SHA-256 of `JSON.stringify(snapshots)`, the rebuild timestamp, and rejected edges. The signature identifies the serialized input, including its array ordering; it is not a canonical graph hash. There is no incremental merge or background synchronization.

## Storage contract

![Logical references between the items and links tables, with rebuild metadata in sync_meta.](assets/storage-model.png)

[View SVG](assets/storage-model.svg)

| Concept | Representation |
|---|---|
| Node identity | Globally unique `items.id` |
| Node category | One `items.kind` value |
| Partition | `items.scope` and `links.scope` |
| Display name | `items.title` |
| Other indexed node fields | `no`, `status`, `updated_at` |
| Directed relationship | `links.from_id`, `to_id`, `type` |
| Relationship properties | JSON object encoded in `links.attrs` |
| Rebuild metadata | Key/value rows in `sync_meta` |

An edge's primary key is `(from_id, to_id, type)`. Different types can connect the same pair, but two edges with the same type and endpoints cannot be stored separately. IDs must be unique across scopes, not just within one scope. Prefixing sample IDs with scope and kind is an importer convention.

SQLite indexes support lookup by node ID, kind/scope, and incoming/outgoing endpoint plus relationship type. JSON relationship properties are retained, but there is no automatic property-index creation or general property-filter API. Most original node properties remain in the source snapshots.

The importer enforces endpoint and scope checks; the schema does not define SQL foreign keys or triggers that enforce all of those invariants. Applications that write directly through `.db` can bypass importer validation.

## Direction, depth, and duplicate handling

![Incoming traversal reverses stored arrows and returns tasks at their minimum depth.](assets/inbound-traversal.png)

[View SVG](assets/inbound-traversal.svg)

`out` follows `from_id → to_id`; `in` reverses that direction; `both` permits either. Direction describes the stored arrow, not a universal business notion of cause or impact.

The default `trace()` implementation (`algorithm: 'sql'`) uses a recursive CTE with `UNION` over `(id, depth)`. An identical node/depth state is explored once. A node reached at different depths produces different states, and final aggregation returns the minimum depth for each node. The optional `algorithm: 'bfs'` visits each node once using batched SQLite adjacency reads. Both implementations follow the same result contract:

- Cycles terminate within the requested depth limit.
- The start node is excluded from the returned rows, including after a cycle.
- Returned rows contain `id`, `title`, `kind`, and minimum `depth`, sorted by depth and ID.
- Results do not contain every path or a reconstructed shortest path.
- A missing or out-of-scope start, or depth zero, returns an empty result.
- A nonempty `types` array is an allowed-type set at every step, not a sequence of required types.

The depth must be an integer from 0 to 10. This bounds recursion depth, not total work or response time. A broad graph can still produce many intermediate states.

`neighbors()` returns all incoming and outgoing incident relationships, including parsed JSON properties. `orphans()` checks the absence of a specified relationship in one direction; it does not require the node to be completely disconnected. `graph()` exports stored rows in a scope, keeping edge `attrs` as JSON text.

## Optional BFS and bidirectional search

`trace({ ...options, algorithm: 'bfs' })` uses a breadth-first search with a visited map for the current request. It reads adjacency in batches of up to 256 frontier IDs through SQLite's existing endpoint indexes and reuses prepared statements. It checks scope on both relationships and destination nodes. The final node records are sorted by SQLite so ordering matches the SQL implementation, including Unicode IDs.

`traceStats(options)` returns `{ count, depthSum }` instead of full records, with the same direction, type, depth, and algorithm options. `shortestDistance({ id, targetId, scope, ...options })` defaults to bidirectional BFS: expand the smaller frontier, finish the layer, and stop when the two searches meet. It returns a hop count or `null`; it does not reconstruct a path. An existing source equal to its target returns zero. Its optional `algorithm: 'sql'` computes the distance from the bounded reachable set.

These algorithms do not preload the graph, cache answers, or add persistent adjacency tables. Their maps and frontiers exist only for one request; prepared statements can be reused after a rebuild. Multi-statement traversals use one SQLite read transaction for a consistent snapshot. An explicit transaction already opened by the caller remains owned by that caller. Work remains synchronous and can still be large on a broad graph.

The [Paradise Papers experiment](../benchmarks/paradise-papers/REPORT.md) measures these public APIs directly. It also checks full returned node records separately from scalar result timing. Graph-wide preloading, CSR projections, weighted paths, and complete path reconstruction are outside this implementation.

## The earlier synthetic benchmark

The September 23 synthetic benchmark's `SqlReader` implements BFS using a global visited set, and bidirectional BFS for shortest distance. It reads adjacency lists from SQLite in batches, reuses statements, and has an additional reverse-lookup index. It does not preload the full graph for measured queries.

That older code remains separate from the new public BFS implementation. Its recursive SQL is adapted to return counts/depth sums or one target distance, so its timing is not a direct measurement of `NodeRel.trace()` returning complete node records. Its measurements have not been replaced by the follow-up results.

This separation matters: using a different search algorithm can change performance much more than changing the database. A shortest-distance query that explores an entire bounded neighborhood should not be treated as algorithmically equivalent to bidirectional search that stops early.

## An AI-facing query flow

The intended integration is:

1. The user asks a natural-language question.
2. The application supplies descriptions for authorized scopes, node kinds, relationships, and operations.
3. The application/model resolves names to actual IDs and handles ambiguous matches.
4. The model proposes a structured operation and arguments.
5. The application validates access, arguments, and resource budgets, then executes an allowed API call or parameterized statement.
6. The application returns results and source information for an answer grounded in the data.

Implemented here: database description export, query functions, and one verified request/result example. A model adapter, generic entity resolver, complete operation dispatcher/validator, and resource-budget runner remain application work. No model is called by `npm run schema`.

Table fields, counts, observed relationship shapes, and JSON property types can be inferred from the database. Business meanings, policy, and metric definitions need explicit domain context. The sample exporter supplies curated descriptions for Movies and Northwind; its observed shapes are not enforced relationship constraints. The `trace`, `traceStats`, and `shortestDistance` operations have JSON Schema argument contracts, including their supported algorithm choices.

The schema lists proposed operations separately from existing ones. In particular, `find_nodes`, `shortest_path`, `match_pattern`, and `explain` are proposals, not callable methods. The implemented `shortestDistance` returns a hop count, while the proposed `shortest_path` would return complete paths. Describing an operation is not the same as implementing it.

## Authored ontology definitions

[NodeRel Ontology v1](ontology.md) adds a documented, project-specific format for concepts, relations, and optional data checks. It remains separate from the schema observed by `describeNodeRel()`. The [example definitions](../ontologies/README.md) can describe broader concepts, labels, and relation meanings even when some concepts have no current instances.

The format is defined, but no ontology loader, graph validator, parent-aware query expander, or AI-description merger is integrated into the runtime. Core import and traversal semantics above remain unchanged. The JSON Schema checks file structure; it is not an OWL/SHACL compatibility layer or an ontology reasoning engine.

## Execution and service boundaries

`DatabaseSync` is synchronous. A long query or rebuild blocks its calling JavaScript thread. An integrating service can use worker threads or separate processes; the benchmark uses independent worker/read connections for concurrent SQLite requests.

A final result limit is not a traversal budget. Services may need explicit visited-node, time, memory, and concurrency limits. None is automatically provided by instructions written into the AI schema.

Scope checks partition supported API operations, but they are not authentication, authorization, or a complete tenant-isolation system. A caller with the raw database handle can issue other SQL. An AI-generated request therefore needs an application-controlled execution boundary.

## Current status

| Implemented | Requires additional work |
|---|---|
| Transactional snapshot rebuild | Automatic source synchronization |
| Bounded traversal, neighbors, missing relationships, statistics | General pattern language and complete path results |
| Fixed node columns and JSON relationship attributes | Arbitrary indexed node properties, multiple labels, same-type parallel edges |
| Actual schema observations and operation descriptions | Automatic natural-language query service and generic name resolution |
| Stored correctness baselines and reproducible benchmarks | A production service with access policies and execution budgets |

See the [query guide](queries.md), [AI integration example](../examples/ai/README.md), and [benchmark report](../benchmarks/neo4j-strengths/REPORT.md) for working examples and measured behavior.
