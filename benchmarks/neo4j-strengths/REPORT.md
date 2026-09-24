# NodeRel and Neo4j: traversal benchmark report

Recorded: `2026-09-23T04:31:28.406Z`. Apple M3, 24 GiB RAM, both systems on the same computer.

This is a historical run. A later [Paradise Papers experiment](../paradise-papers/REPORT.md) measures the new public NodeRel BFS APIs. The custom SQLite code and numeric results below remain the original implementation and measurements.

## Findings

Neo4j showed an advantage on broad multi-hop reachability and concurrent execution of that workload. Small local reads favored embedded SQLite. Specialized bidirectional BFS substantially changed the SQLite shortest-distance results.

- Six-hop reachability: **25.846 ms** for custom SQLite BFS and **13.592 ms** for Neo4j, about a **1.9× latency advantage** for Neo4j.
- At eight concurrent clients, Neo4j delivered approximately **3.1–3.3× the throughput** in the primary run and a reversed-order repeat.
- Single-node lookup and three-hop reachability were faster with custom SQLite code in this environment.
- Shortest-distance queries were similar in median latency once SQLite used bidirectional BFS. The large difference from recursive SQL is heavily algorithm-dependent.

These findings apply to this graph, query set, environment, and measurement procedure. They are not a universal ranking of database engines.

## Implementations

![In-process SQLite and a separate Neo4j server queried over Bolt.](../../docs/assets/execution-models.png)

[View SVG](../../docs/assets/execution-models.svg)

| Label | Implementation | Relationship to the public API |
|---|---|---|
| `sqlite-cte` | Recursive `UNION` over `(id, depth)`, followed by minimum-depth aggregation | Same general approach as `trace()`, adapted to benchmark outputs; not a direct timing of the public method |
| `sqlite-optimized` | Indexed SQL for point lookup; batched JavaScript BFS for reachability and bidirectional BFS for shortest distance | Separate benchmark implementation; not integrated into `NodeRel.trace()` |
| `neo4j-bolt` | Cypher via the official JavaScript driver, local Bolt, reused connections | Server query execution plus transport and client result handling |

The CTE does not accumulate path strings. It removes duplicate node/depth states but can revisit a node at another depth. For shortest-distance questions it explores the bounded reachable graph before selecting the target distance. Custom BFS keeps a global visited set; bidirectional search can stop when frontiers meet.

The custom implementation reads adjacency through SQLite indexes in batches of up to 256 frontier nodes, reuses prepared statements, and uses an additional reverse-lookup index. It does not preload the graph or cache answers. The separate in-memory reference used for correctness is excluded from timings.

## Single-request latency

![Recorded median query latency](../../docs/assets/query-latency.png)

[View SVG](../../docs/assets/query-latency.svg)

Median milliseconds, including receiving and handling results. Lower is better. A dash means no separate measurement.

| Workload | SQLite CTE | SQLite + custom BFS* | Neo4j Bolt |
|---|---:|---:|---:|
| Call overhead: SELECT / RETURN 1 | — | 0.002 | 0.311 |
| Single node lookup | — | 0.006 | 0.276 |
| Shortest distance, up to 10 hops | 1,709.006 | 1.530 | 1.919 |
| Shortest distance avoiding inactive nodes | 1,291.534 | 1.903 | 1.984 |
| Reachability within 3 hops | 0.535 | 0.194 | 1.043 |
| Reachability within 6 hops | 98.085 | 25.846 | 13.592 |

\* Call-overhead and point-lookup rows use direct SQL. BFS applies to the graph-search workloads.

Six-hop queries reached **31,761–32,283 nodes** per source. Three-hop queries reached roughly 250 nodes. Hop count alone is not a portable threshold for choosing a database: branching, graph shape, and the returned result all change the workload.

Reachability returns a node count and the sum of minimum depths. It does not transfer every reached node to the client. Shortest-distance queries are bounded at ten hops and return a distance, not a reconstructed path.

The no-op row measures total fixed call overhead, including transaction/driver handling, not pure network time. Its median was 0.311084 ms for Bolt and 0.001542 ms for SQLite. These values were not subtracted from query timings.

## Concurrent reachability

![Recorded six-hop reachability throughput](../../docs/assets/concurrent-throughput.png)

[View SVG](../../docs/assets/concurrent-throughput.svg)

Each SQLite client has a separate worker thread and read connection. Neo4j uses the same number of Bolt sessions. Each client submits its next request after the previous one completes: this is a closed-loop workload. Each condition runs for about six seconds after preparation, and its elapsed time includes completion of the final requests.

| Run | Clients | SQLite requests/s | Neo4j requests/s | Neo4j / SQLite | SQLite p95 ms | Neo4j p95 ms |
|---|---:|---:|---:|---:|---:|---:|
| Primary | 1 | 35.4 | 80.8 | 2.28× | 34.1 | 16.5 |
| Primary | 4 | 78.0 | 188.2 | 2.41× | 68.4 | 34.1 |
| Primary | 8 | 67.4 | 225.5 | 3.34× | 211.3 | 69.7 |
| Reversed-order repeat | 8 | 105.0 | 325.9 | 3.10× | 110.4 | 47.5 |

The primary run measured Neo4j before SQLite at each concurrency level. The repeat measured SQLite before Neo4j at eight clients. Absolute throughput changed substantially, while the relative advantage remained. These short local read runs do not establish sustained service capacity, and increasing SQLite workers did not always increase throughput.

## Where Neo4j helped

### Graph execution operators

Unique indexes locate the start and target nodes. The recorded `PROFILE` output includes `ShortestPath` for shortest distance and `VarLengthExpand(Pruning,BFS,All)` for reachability. These plans are visible in [query-plans.json](query-plans.json). Neo4j selected graph operators from a declarative query; the comparable SQLite BFS required custom application code.

The measured six-hop query is:

```cypher
MATCH p=(s:Bench {id: $source})-[:LINK*1..6]->(n)
WITH s, n, min(length(p)) AS depth
WHERE n <> s
RETURN count(n) AS count, coalesce(sum(depth), 0) AS depthSum
```

The source is excluded by node identity. This query was improved during preliminary work before the recorded final run.

### Conditions on a path

The filtered shortest-distance workload asks for a path containing only active nodes:

```cypher
MATCH (s:Bench {id: $source}), (t:Bench {id: $target})
MATCH p=shortestPath((s)-[:LINK*1..10]->(t))
WHERE all(n IN nodes(p) WHERE n.status = 'active')
RETURN length(p) AS distance
```

The result matched the independent reference. Its median latency did not demonstrate an advantage over specialized SQLite BFS in this run. Expressing the constraint directly is an implementation-effort advantage, separate from a measured speed advantage. The examples retain the syntax used in the experiment; see [Neo4j shortest-path documentation](https://neo4j.com/docs/cypher-manual/25/patterns/shortest-paths/) for current path constructs.

### Concurrent broad reads

Neo4j handled more completed six-hop requests per second under the tested concurrency. This does not mean SQLite lacks concurrent reading; [SQLite supports multiple readers](https://www.sqlite.org/whentouse.html). The measured difference also includes SQL-to-JavaScript data movement, JavaScript data structures, worker communication, and each system's execution design.

## Methodology

| Setting | Recorded value |
|---|---|
| Hardware | Apple M3, 8 logical CPUs, 24 GiB RAM |
| Runtime | Node v24.13.1; SQLite 3.51.2 |
| Neo4j | Community 2025.06.2; JavaScript driver 5.28.3 |
| Neo4j memory | Heap 1 GiB + page cache 1 GiB |
| SQLite cache | Up to 64 MiB per connection; file approximately 43 MiB |
| Graph | 50,000 nodes; 300,000 directed edges; seed 20260923 |
| Samples | 120 each for no-op/point; 12 each for shortest/filtered; 24 each for reach3/reach6 |
| Warmups per workload | Neo4j 40; custom SQLite 8; CTE 2 |

The graph contains a directed ring plus five distinct pseudorandom outgoing edges per node, without self-loops or duplicate edges. Ten percent of nodes are inactive. Source/target pairs vary; selected endpoints are active and distinct. Reachability varies over 24 source nodes.

Neo4j uses a reused local Bolt connection/session, an explicit database, and auto-commit reads. These choices reduce avoidable client overhead; see the [official driver performance guidance](https://neo4j.com/docs/javascript-manual/current/performance/). SQLite uses a local WAL-mode file, prepared statements, and memory temporary storage.

For single queries, measurement order alternates between implementations within each workload. Startup, import, connection initialization, plan capture, and correctness-reference computation are excluded. No response cache is used. The data fits the configured caches; this is not an equal-memory-budget experiment.

The recorded driver-reported server timings are preserved in JSON. Their integer-millisecond resolution and different measurement scope make them unsuitable as a standalone engine-speed comparison. The published tables use client wall-clock time.

### Correctness

The primary run and reversed-order repeat recorded **7,529 result checks** in total, including concurrency warmups. No-op and point-lookup outputs were checked against fixed expected values; shortest distance, reached-node count, and summed minimum depth were checked against an independent in-memory BFS. Complete `(node ID, minimum depth)` sets were also compared for three sources:

| Source | Reached nodes | Complete sets match |
|---|---:|---|
| `n06724` | 32,151 | Yes |
| `n42366` | 31,829 | Yes |
| `n25621` | 31,906 | Yes |

These checks support correctness for the sampled workloads. Aggregate equality alone is not a proof of identical node sets for every source; the full-set checks address three additional cases.

## Latency distribution

Median uses the upper middle order statistic of sorted observations. p95 uses the nearest-rank definition. With only 12 shortest-distance samples, p95 is the maximum sample, so it should not be interpreted as a stable service-level tail estimate.

| Workload | Implementation | Samples | Median ms | p95 ms |
|---|---|---:|---:|---:|
| Call overhead: SELECT / RETURN 1 | `neo4j-bolt` | 120 | 0.311 | 0.779 |
| Call overhead: SELECT / RETURN 1 | `sqlite-optimized` | 120 | 0.002 | 0.007 |
| Single node lookup | `neo4j-bolt` | 120 | 0.276 | 0.545 |
| Single node lookup | `sqlite-optimized` | 120 | 0.006 | 0.173 |
| Shortest distance, up to 10 hops | `neo4j-bolt` | 12 | 1.919 | 3.008 |
| Shortest distance, up to 10 hops | `sqlite-optimized` | 12 | 1.530 | 6.717 |
| Shortest distance, up to 10 hops | `sqlite-cte` | 12 | 1,709.006 | 1,871.743 |
| Shortest distance avoiding inactive nodes | `neo4j-bolt` | 12 | 1.984 | 4.875 |
| Shortest distance avoiding inactive nodes | `sqlite-optimized` | 12 | 1.903 | 2.601 |
| Shortest distance avoiding inactive nodes | `sqlite-cte` | 12 | 1,291.534 | 1,329.224 |
| Reachability within 3 hops | `neo4j-bolt` | 24 | 1.043 | 13.761 |
| Reachability within 3 hops | `sqlite-optimized` | 24 | 0.194 | 1.073 |
| Reachability within 3 hops | `sqlite-cte` | 24 | 0.535 | 1.046 |
| Reachability within 6 hops | `neo4j-bolt` | 24 | 13.592 | 21.336 |
| Reachability within 6 hops | `sqlite-optimized` | 24 | 25.846 | 34.997 |
| Reachability within 6 hops | `sqlite-cte` | 24 | 98.085 | 104.796 |

## Limits and practical interpretation

This synthetic graph was chosen to create broad traversals. Real graphs may have clusters, hubs, more relationship types, changing data, or disk-cache misses. A local derived index centered on small reads can benefit from SQLite's low call overhead and simple deployment. Repeated broad graph queries and concurrent graph access provide reasons to evaluate Neo4j against the application's real data.

Cold-cache performance, concurrent writes, long-running service load, high availability, production authorization, and GDS algorithms were not tested. No result here measures all features of either platform or guarantees performance at another scale.

## Reproduction and provenance

The [reproduction guide](README.md) explains how to import the graph, run the benchmark, reverse the eight-client measurement order, and regenerate the SVG/PNG charts. [results.json](results.json) contains all raw measurements. [common.mjs](common.mjs) contains the actual queries and traversal algorithms.

This English report and its charts were prepared from the existing recorded run. The documentation update did not rerun the databases or replace numeric measurements.
