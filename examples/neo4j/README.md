# Official Neo4j examples in NodeRel

This demo imports the official Movies and Northwind example graphs into NodeRel. Fifteen queries were executed against an isolated Neo4j server and compared with SQLite results; all matched. The recorded results remain available without keeping that server running.

| Dataset | Nodes | Relationships |
|---|---:|---:|
| Movies | 171 | 253 |
| Northwind | 1,035 | 3,139 |
| Total | 1,206 | 3,392 |

## Run locally

Use Node.js 24.13.1 or later. From this directory:

```sh
node demo.mjs rebuild
node demo.mjs test
node demo.mjs list
node demo.mjs show 1
node demo.mjs show 10
node demo.mjs stats
node demo.mjs trace movies "Keanu Reeves" both 4 ACTED_IN
```

No npm dependencies or live Neo4j server are required. The test executes current SQLite queries and compares them with **stored** Neo4j results. The original case names in the executable fixtures are Korean; the [report](REPORT.md) supplies the English list in the same order.

From the repository root, use `npm run demo:build`, `npm run demo -- test`, or `npm run demo -- show 1`.

## Files

| File | Purpose |
|---|---|
| `noderel.sqlite` | Generated database; excluded from Git |
| [noderel.mjs](noderel.mjs) | Re-exports the shared core implementation |
| [snapshots/](snapshots/) | Import inputs, including original node and relationship properties |
| [cases.mjs](cases.mjs) | Fifteen SQL/API–Cypher query pairs |
| [expected-results.json](expected-results.json) | Stored reference results for regression tests |
| [results.json](results.json) | Historical environment, timings, correctness checks, and returned rows |
| [REPORT.md](REPORT.md) | English report and result interpretation |
| [sources.json](sources.json) | Original URLs, download sizes, and SHA-256 checksums |

## Mapping the graph

| Neo4j concept | NodeRel representation |
|---|---|
| Node label such as `Person` or `Movie` | `items.kind` |
| Example dataset name | `items.scope` |
| Original key with scope/kind prefixes | `items.id` |
| Human-readable name | `items.title` |
| Relationship endpoints and type | `links.from_id`, `to_id`, `type` |
| Roles, quantities, and other edge properties | JSON in `links.attrs` |
| Remaining node properties, such as release year or price | `source.properties` in the original snapshot |

Original relationship directions are preserved. `out` follows the arrow, `in` reverses it, and `both` allows either direction. An arrow does not always represent causal influence: acting in a movie and purchasing an order have their own meanings.

No relationships were discarded from these two datasets. All indexed fields and relationship properties were checked against the source snapshots. The sample model has one node kind per node and cannot represent duplicate same-type edges between the same endpoints.

## Validation coverage

The examples cover movie lookup, cast and roles, co-actors, overlapping relationship types, bounded reachability, shortest distance, missing relationships, product/category joins, customer purchases, aggregates, and order quantities.

Additional regression checks cover cycles and substring-like IDs, scope boundaries, depth validation, and preserving the previous index when rebuilding with invalid input. The root test also checks the schema exporter, verified AI request, and SQLite integrity.

This demonstrates that these particular questions can be answered correctly. It does not implement all Cypher features or retain every original property in the index. Queries using unindexed node properties must consult the snapshots or extend the storage model.

## Timing scope

The historical small-sample run used one client, three warmups, and eleven measured calls. SQLite ran in process; Neo4j used local **HTTP with JSON transport**. These measurements are preserved in the report but are not a pure engine comparison or a concurrent-load test.

The larger [50,000-node benchmark](../../benchmarks/neo4j-strengths/README.md) uses **Bolt**, different cache settings, and different workloads. Its timings should not be combined with this earlier run.

## Sources

The datasets come from the [Neo4j official example catalog](https://neo4j.com/docs/getting-started/appendix/example-data/), [Movies repository](https://github.com/neo4j-graph-examples/movies), and [Northwind repository](https://github.com/neo4j-graph-examples/northwind). Names, titles, and descriptions are part of the source data. See [third-party notices](../../THIRD_PARTY_NOTICES.md) for attribution and terms.
